// Minimal GitHub REST client — only what the content service needs.
// Reads go through the Contents API; writes use the Git Data API so a change
// touching several files (an undo, for example) lands as one commit.

export interface FileChange {
  path: string;
  /** New UTF-8 content, or null to delete the file. */
  content: string | null;
}

export interface CommitAuthor {
  name: string;
  email: string;
}

export interface CommitSummary {
  sha: string;
  short: string;
  date: string;
  author: string;
  message: string;
  url: string;
}

export interface CommitDetail extends CommitSummary {
  parents: string[];
  files: { path: string; status: string; previous_path?: string }[];
}

export interface DeployRun {
  status: string;
  conclusion: string | null;
  head_sha: string;
  updated_at: string;
  url: string;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface GitHubClient {
  readFile(path: string, ref?: string): Promise<{ content: string; sha: string }>;
  listDir(path: string): Promise<{ name: string; path: string; type: string }[]>;
  commit(opts: { message: string; author: CommitAuthor; changes: FileChange[] }): Promise<{ sha: string; url: string }>;
  listCommits(path: string, limit: number): Promise<CommitSummary[]>;
  getCommit(sha: string): Promise<CommitDetail>;
  latestDeploy(): Promise<{ run: DeployRun | null; headSha: string }>;
}

const API = 'https://api.github.com';

export function createGitHubClient(opts: { repo: string; branch: string; token: string }): GitHubClient {
  const { repo, branch, token } = opts;

  async function gh<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'connectedpnw-content-service',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = ((await res.json()) as { message?: string }).message ?? '';
      } catch {
        /* ignore */
      }
      throw new GitHubError(`GitHub ${method} ${path} failed (${res.status}) ${detail}`.trim(), res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  const decode = (b64: string) => {
    const bin = atob(b64.replace(/\n/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  const encode = (text: string) => {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  };

  const summarize = (c: {
    sha: string;
    html_url: string;
    commit: { message: string; author: { name: string; date: string } };
  }): CommitSummary => ({
    sha: c.sha,
    short: c.sha.slice(0, 7),
    date: c.commit.author.date,
    author: c.commit.author.name,
    message: c.commit.message,
    url: c.html_url,
  });

  return {
    async readFile(path, ref = branch) {
      const data = await gh<{ content: string; sha: string; encoding: string }>(
        'GET',
        `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      );
      return { content: decode(data.content), sha: data.sha };
    },

    async listDir(path) {
      return gh('GET', `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`);
    },

    async commit({ message, author, changes }) {
      if (changes.length === 0) throw new Error('Nothing to commit');
      const ref = await gh<{ object: { sha: string } }>('GET', `/repos/${repo}/git/ref/heads/${branch}`);
      const headSha = ref.object.sha;
      const head = await gh<{ tree: { sha: string } }>('GET', `/repos/${repo}/git/commits/${headSha}`);

      const tree = await Promise.all(
        changes.map(async (ch) => {
          if (ch.content === null) return { path: ch.path, mode: '100644', type: 'blob', sha: null };
          const blob = await gh<{ sha: string }>('POST', `/repos/${repo}/git/blobs`, {
            content: encode(ch.content),
            encoding: 'base64',
          });
          return { path: ch.path, mode: '100644', type: 'blob', sha: blob.sha };
        }),
      );

      const newTree = await gh<{ sha: string }>('POST', `/repos/${repo}/git/trees`, {
        base_tree: head.tree.sha,
        tree,
      });
      const commit = await gh<{ sha: string; html_url: string }>('POST', `/repos/${repo}/git/commits`, {
        message,
        tree: newTree.sha,
        parents: [headSha],
        author: { ...author, date: new Date().toISOString() },
      });
      // Non-forced: if someone else pushed in between, GitHub rejects this and
      // the caller can simply retry.
      await gh('PATCH', `/repos/${repo}/git/refs/heads/${branch}`, { sha: commit.sha, force: false });
      return { sha: commit.sha, url: commit.html_url };
    },

    async listCommits(path, limit) {
      const list = await gh<Parameters<typeof summarize>[0][]>(
        'GET',
        `/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&per_page=${limit}`,
      );
      return list.map(summarize);
    },

    async getCommit(sha) {
      const c = await gh<
        Parameters<typeof summarize>[0] & {
          parents: { sha: string }[];
          files: { filename: string; status: string; previous_filename?: string }[];
        }
      >('GET', `/repos/${repo}/commits/${sha}`);
      return {
        ...summarize(c),
        parents: c.parents.map((p) => p.sha),
        files: (c.files ?? []).map((f) => ({ path: f.filename, status: f.status, previous_path: f.previous_filename })),
      };
    },

    async latestDeploy() {
      const ref = await gh<{ object: { sha: string } }>('GET', `/repos/${repo}/git/ref/heads/${branch}`);
      const runs = await gh<{ workflow_runs: (DeployRun & { html_url: string })[] }>(
        'GET',
        `/repos/${repo}/actions/workflows/deploy.yml/runs?branch=${encodeURIComponent(branch)}&per_page=1`,
      );
      const r = runs.workflow_runs[0];
      return {
        headSha: ref.object.sha,
        run: r
          ? { status: r.status, conclusion: r.conclusion, head_sha: r.head_sha, updated_at: r.updated_at, url: r.html_url }
          : null,
      };
    },
  };
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}
