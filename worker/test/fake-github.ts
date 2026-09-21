// In-memory stand-in for the GitHub client so the tools can be tested end to end.
import type { CommitDetail, CommitSummary, DeployRun, FileChange, GitHubClient } from '../src/github';
import { GitHubError } from '../src/github';

export class FakeGitHub implements GitHubClient {
  files = new Map<string, string>();
  snapshots = new Map<string, Map<string, string>>();
  history: CommitDetail[] = [];
  deploy: { run: DeployRun | null } = { run: null };
  private counter = 0;

  constructor(initial: Record<string, string> = {}) {
    for (const [p, c] of Object.entries(initial)) this.files.set(p, c);
    this.snapshot('0000000');
  }

  private snapshot(sha: string) {
    this.snapshots.set(sha, new Map(this.files));
  }

  head() {
    return this.history.at(-1)?.sha ?? '0000000';
  }

  async readFile(path: string, ref?: string) {
    const source = ref ? this.snapshots.get(ref) ?? this.snapshots.get([...this.snapshots.keys()].find((k) => k.startsWith(ref)) ?? '') : this.files;
    const content = source?.get(path);
    if (content === undefined) throw new GitHubError(`Not found: ${path}@${ref ?? 'HEAD'}`, 404);
    return { content, sha: 'blob' };
  }

  async listDir(path: string) {
    return [...this.files.keys()]
      .filter((p) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/'))
      .map((p) => ({ name: p.slice(path.length + 1), path: p, type: 'file' }));
  }

  async commit({ message, author, changes }: { message: string; author: { name: string; email: string }; changes: FileChange[] }) {
    const parent = this.head();
    const files: CommitDetail['files'] = [];
    for (const ch of changes) {
      const existed = this.files.has(ch.path);
      if (ch.content === null) {
        if (!existed) throw new GitHubError('delete of missing file', 422);
        this.files.delete(ch.path);
        files.push({ path: ch.path, status: 'removed' });
      } else {
        this.files.set(ch.path, ch.content);
        files.push({ path: ch.path, status: existed ? 'modified' : 'added' });
      }
    }
    const sha = (++this.counter).toString(16).padStart(7, 'a') + 'f'.repeat(33);
    this.snapshot(sha);
    const detail: CommitDetail = {
      sha,
      short: sha.slice(0, 7),
      date: new Date(2026, 0, this.counter).toISOString(),
      author: author.name,
      message,
      url: `https://github.example/commit/${sha}`,
      parents: [parent],
      files,
    };
    this.history.push(detail);
    return { sha, url: detail.url };
  }

  async listCommits(path: string, limit: number): Promise<CommitSummary[]> {
    return [...this.history]
      .reverse()
      .filter((c) => c.files.some((f) => f.path.startsWith(path)))
      .slice(0, limit);
  }

  async getCommit(sha: string) {
    const c = this.history.find((h) => h.sha.startsWith(sha));
    if (!c) throw new GitHubError('no such commit', 422);
    return c;
  }

  async latestDeploy() {
    return { run: this.deploy.run, headSha: this.head() };
  }
}
