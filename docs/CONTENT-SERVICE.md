# Content Service — agent and CMS editing

The **content service** is a small Cloudflare Worker (`worker/`) that lets the founders edit the site without touching GitHub:

| Surface | Who uses it | URL |
|---|---|---|
| MCP server | Claude (custom connector), ChatGPT (developer-mode connector) | `https://content.connectedpnw.com/mcp` |
| REST + OpenAPI | A ChatGPT custom GPT ("actions") | `https://content.connectedpnw.com/api/tools/…`, spec at `/openapi.json` |
| GitHub OAuth relay | The `/admin` editing page (Sveltia CMS) | `/auth`, `/callback` |

All three write the same Markdown files in `src/content/`. Every save is a commit to `main`, so the existing deploy runner publishes it within a couple of minutes. Nothing about hosting changes.

Founder-facing instructions live at **https://connectedpnw.com/admin/setup/** (`public/admin/setup/index.html`).

---

## How it works

```
Claude / ChatGPT ──OAuth──▶ Worker (/mcp or /api) ──validate──▶ GitHub commit to main ──▶ self-hosted runner builds ──▶ live
                             │
   Google sign-in ◀──────────┘  (/authorize: allowlisted emails only)

/admin (Sveltia CMS) ──GitHub sign-in via Worker /auth──▶ commits from the browser ──▶ same pipeline
```

- **Tools** (`worker/src/tools.ts`): `list_pages`, `get_page`, `update_page`, `add_list_item`, `update_list_item`, `remove_list_item`, `list_posts`, `get_post`, `create_post`, `update_post`, `set_post_published`, `delete_post`, `list_recent_changes`, `undo_change`, `get_deploy_status`. One definition drives MCP, REST/OpenAPI and the tests.
- **Validation**: every write is checked against `src/content/schema.ts` — the same zod schema Astro uses at build time — *before* it is committed. A bad edit is rejected with a plain-English message instead of breaking the build.
- **Comments survive**: frontmatter is edited through the `yaml` Document API, so the helper comments in the content files are kept.
- **Attribution**: commits are authored as the signed-in editor (name + email) with the message suffix "Edited by *Name* via *Claude/ChatGPT*".
- **Undo**: `undo_change` restores the files a content commit touched to their previous state, as a new commit. It refuses commits that touch anything outside `src/content/`.
- **Auth**: OAuth 2.1 via `@cloudflare/workers-oauth-provider` (dynamic client registration, PKCE, tokens in KV). Identity comes from Google sign-in; only emails in `ALLOWED_EMAILS` may complete the flow.
- **Blog drafts**: `create_post` saves `draft: true` unless told otherwise; publishing is a separate call.

---

## One-time setup (developer)

Estimated time: about 45 minutes. Everything runs on the free tiers.

### 1. Cloudflare KV namespace

```bash
npm ci --prefix worker
cd worker && npx wrangler login && npx wrangler kv namespace create OAUTH_KV
```

Paste the returned `id` into `kv_namespaces[0].id` in `worker/wrangler.jsonc`.

### 2. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project (e.g. *Connected PNW*).
2. **APIs & Services → OAuth consent screen**: External, app name *Connected PNW website editor*, your support email. Scopes: only `openid`, `email`, `profile` (non-sensitive, so no Google verification needed). Publish the app (Publishing status: *In production*) so sign-ins don't expire.
3. **Credentials → Create credentials → OAuth client ID**, type *Web application*.
   Authorised redirect URI: `https://content.connectedpnw.com/callback/google`
4. Put the client ID in `worker/wrangler.jsonc` under `vars.GOOGLE_CLIENT_ID`. Keep the secret for step 5.

> ⚠️ **Which emails are allowed.** `ALLOWED_EMAILS` in `wrangler.jsonc` lists `miri@connectedpnw.com` and `nina@connectedpnw.com`. Google sign-in reports the **Google account's** address. Those `@connectedpnw.com` addresses are Cloudflare Email Routing forwarders, so they will only match if each founder has a Google account *created with* that address (Google → "Use my current email address instead"; the verification mail arrives via forwarding). If they sign in with a personal Gmail instead, add that Gmail to `ALLOWED_EMAILS` and redeploy. The "not on the editor list" page shows the address that was used.

### 3. GitHub token (V1 placeholder)

Create a **fine-grained personal access token** at GitHub → Settings → Developer settings:

- Repository access: only `guyarie/connectedpnw`
- Permissions: **Contents: Read and write**, **Actions: Read** (for `get_deploy_status`)
- Expiration: 1 year. **Note the date** — the service stops working when it expires. V2 replaces this with a GitHub App that does not expire.

### 4. GitHub OAuth app (for `/admin` only)

GitHub → Settings → Developer settings → **OAuth Apps → New**:

- Homepage: `https://connectedpnw.com`
- Authorization callback URL: `https://content.connectedpnw.com/callback`

Put the client ID in `vars.GITHUB_OAUTH_CLIENT_ID`. If you decide to skip `/admin`, leave both `GITHUB_OAUTH_*` values unset; the rest still works.

### 5. Secrets and deploy

```bash
npm run worker:secret GOOGLE_CLIENT_SECRET
npm run worker:secret GITHUB_TOKEN
npm run worker:secret GITHUB_OAUTH_CLIENT_SECRET   # only if /admin is used
npm run worker:deploy
curl https://content.connectedpnw.com/health        # {"ok":true}
```

`wrangler.jsonc` binds the custom domain `content.connectedpnw.com` on the Cloudflare zone. To use the `*.workers.dev` URL instead, delete the `routes` block and change `SERVICE_URL` (and the URLs in steps 2, 4, `public/admin/config.yml` and `public/admin/setup/index.html`).

### 6. Claude

Nothing to do server-side. Each founder adds the connector once: Claude → Settings → Connectors → Add custom connector → URL `https://content.connectedpnw.com/mcp`. Claude registers itself, sends them to Google sign-in, done.

Test it yourself first with your own email temporarily in `ALLOWED_EMAILS`.

### 7. ChatGPT custom GPT

1. ChatGPT → Explore GPTs → **Create**. Name: *Connected PNW Editor*. Instructions: paste the text of `SERVER_INSTRUCTIONS` from `worker/src/tools.ts`.
2. **Actions → Create new action → Import from URL**: `https://content.connectedpnw.com/openapi.json`.
3. Authentication: **OAuth**. ChatGPT now shows a *Callback URL* like `https://chat.openai.com/aip/g-XXXX/oauth/callback`. Register a client for it:

   ```bash
   curl -s https://content.connectedpnw.com/oauth/register -H 'Content-Type: application/json' -d '{
     "client_name": "ChatGPT",
     "redirect_uris": ["https://chat.openai.com/aip/g-XXXX/oauth/callback"],
     "token_endpoint_auth_method": "client_secret_post"
   }'
   ```

   Copy `client_id` and `client_secret` from the response into the action. Authorization URL `https://content.connectedpnw.com/authorize`, Token URL `https://content.connectedpnw.com/oauth/token`, Scope `content:edit`, Token exchange method: *Default (POST request)*.
4. Save, then **Share → Anyone with the link**. Paste the link into `GPT_URL` in `public/admin/setup/index.html` and commit.

Dynamically registered clients expire after 90 days by default; the GPT's client is created the same way, so re-run step 3 if ChatGPT starts failing to sign in — or create a permanent client with `env.OAUTH_PROVIDER.createClient()` from a one-off script.

---

## Local development

The worker is its own npm package (so the site's deploy install stays small):

```bash
npm ci --prefix worker
cp worker/.dev.vars.example worker/.dev.vars   # fill in the secrets
npm run worker:dev                              # http://localhost:8787
npm run worker:check                            # typecheck + tests
```

Talk to the MCP server without an OAuth client by using the tests as examples (`worker/test/`), or point an MCP inspector at `http://localhost:8787/mcp` and complete the Google flow (add `http://localhost:8787/callback/google` as a redirect URI on the Google client).

---

## Keeping things in sync

Three places describe the content fields. When a field is added or renamed:

1. `src/content/schema.ts` — the source of truth (Astro **and** the worker validate with it).
2. `public/admin/config.yml` — the `/admin` editor shows only fields listed there.
3. `docs/EDITING.md` — the human guide.

`LIST_FIELDS` and `PAGES` in `schema.ts` tell the tools which fields are lists and what each page is for; update them when adding a page or a list.

---

## V2 candidates

- **GitHub App** instead of the PAT (no expiry, commits attributed to the app, per-editor author retained).
- **Image upload** through chat: an `upload_image_from_url` tool, plus size limits.
- **Preview before publish** for page copy (commit to a branch + PR) if instant publish turns out to be a problem.
- A permanent OAuth client for the custom GPT via `createClient()`.
