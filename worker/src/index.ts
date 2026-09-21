// Connected PNW content service.
//
//   /mcp                  MCP server (Claude / ChatGPT connectors) — OAuth protected
//   /api/tools/{name}     REST mirror of the tools (ChatGPT custom GPT) — OAuth protected
//   /openapi.json         OpenAPI description for the custom GPT
//   /authorize, /oauth/*  OAuth server (Google sign-in + allowlist)
//   /auth, /callback      GitHub OAuth for the /admin CMS (Sveltia)
//   /health               liveness
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import type { EditorProps, Env } from './env';
import { createGitHubClient } from './github';
import { handleMcp } from './mcp';
import { handleRest, openApiDocument } from './rest';
import { GOOGLE_CALLBACK_PATH, handleAuthorize, handleGoogleCallback } from './google-auth';
import { handleCmsAuth, handleCmsCallback } from './cms-auth';
import type { ToolContext } from './tools';

const AUTHORIZE = '/authorize';
const TOKEN = '/oauth/token';
const REGISTER = '/oauth/register';

function toolContext(env: Env, editor: EditorProps): ToolContext {
  return {
    gh: createGitHubClient({ repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH || 'main', token: env.GITHUB_TOKEN }),
    editor,
    siteUrl: env.SITE_URL,
  };
}

// Requests here have already been authenticated by the OAuth provider.
const apiHandler: ExportedHandler<Env> & { fetch: NonNullable<ExportedHandler<Env>['fetch']> } = {
  async fetch(request, env, ctx) {
    const editor = (ctx as ExecutionContext & { props: EditorProps }).props;
    const url = new URL(request.url);
    const tctx = toolContext(env, editor);
    if (url.pathname === '/mcp') return handleMcp(request, tctx);
    if (url.pathname.startsWith('/api/')) return handleRest(request, tctx);
    return new Response('Not found', { status: 404 });
  },
};

const defaultHandler: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case AUTHORIZE:
        return handleAuthorize(request, env);
      case GOOGLE_CALLBACK_PATH:
        return handleGoogleCallback(request, env);
      case '/auth':
        return handleCmsAuth(request, env);
      case '/callback':
        return handleCmsCallback(request, env);
      case '/openapi.json':
        return Response.json(openApiDocument(env.SERVICE_URL, TOKEN, AUTHORIZE));
      case '/health':
        return Response.json({ ok: true });
      case '/':
        return Response.redirect(`${env.SITE_URL}/admin/setup/`, 302);
      default:
        return new Response('Not found', { status: 404 });
    }
  },
};

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const provider = new OAuthProvider<Env>({
      apiRoute: ['/mcp', '/api/'],
      apiHandler,
      defaultHandler,
      authorizeEndpoint: AUTHORIZE,
      tokenEndpoint: TOKEN,
      clientRegistrationEndpoint: REGISTER,
      scopesSupported: ['content:edit'],
      resourceMetadata: {
        resource: `${env.SERVICE_URL}/mcp`,
        authorization_servers: [env.SERVICE_URL],
        scopes_supported: ['content:edit'],
        resource_name: 'Connected PNW website editor',
      },
      // Tokens for the REST mirror must also be accepted at /api/*.
      resourceMatchOriginOnly: true,
      accessTokenTTL: 60 * 60 * 24,
    });
    return provider.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
