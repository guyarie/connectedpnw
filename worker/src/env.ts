import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

export interface Env {
  // --- Bindings (wrangler.jsonc) ---
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;

  // --- Plain vars (wrangler.jsonc `vars`) ---
  /** Public URL of this worker, no trailing slash. */
  SERVICE_URL: string;
  /** Public URL of the website, no trailing slash. */
  SITE_URL: string;
  /** owner/repo */
  GITHUB_REPO: string;
  /** Branch that deploys. */
  GITHUB_BRANCH: string;
  /** Comma-separated Google account emails allowed to edit. */
  ALLOWED_EMAILS: string;
  GOOGLE_CLIENT_ID: string;
  /** GitHub OAuth app used by the /admin CMS login (Sveltia). */
  GITHUB_OAUTH_CLIENT_ID?: string;

  // --- Secrets (`wrangler secret put`) ---
  GOOGLE_CLIENT_SECRET: string;
  /** Fine-grained PAT (V1) — Contents: read/write, Actions: read on the repo. */
  GITHUB_TOKEN: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
}

/** What we know about the signed-in editor; stored (encrypted) in the OAuth grant. */
export interface EditorProps {
  email: string;
  name: string;
  /** The app the editor connected through, e.g. "Claude" or "ChatGPT". */
  client: string;
}

export function allowedEmails(env: Env): string[] {
  return (env.ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
