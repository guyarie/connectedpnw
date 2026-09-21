// GitHub OAuth for the /admin page (Sveltia CMS). Sveltia opens a popup at
// /auth; after GitHub sign-in we post the token back to the CMS window using
// the Decap/Netlify handshake it expects. Unrelated to the agent login.
import { escape } from './google-auth';
import type { Env } from './env';
import { htmlPage } from './pages';

const STATE_COOKIE = 'cms_oauth_state';

export async function handleCmsAuth(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET) {
    return htmlPage('CMS login not configured', '<p>The GitHub OAuth app for /admin has not been set up yet.</p>', 503);
  }
  const url = new URL(request.url);
  if (url.searchParams.get('provider') && url.searchParams.get('provider') !== 'github') {
    return htmlPage('Unsupported provider', '<p>Only GitHub login is supported.</p>', 400);
  }
  const state = crypto.randomUUID();
  const gh = new URL('https://github.com/login/oauth/authorize');
  gh.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  gh.searchParams.set('redirect_uri', `${env.SERVICE_URL}/callback`);
  gh.searchParams.set('scope', 'repo,user');
  gh.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: gh.toString(),
      'Set-Cookie': `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/callback; Max-Age=600`,
    },
  });
}

export async function handleCmsCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = /(?:^|;\s*)cms_oauth_state=([^;]+)/.exec(request.headers.get('Cookie') ?? '')?.[1];
  const clearCookie = `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/callback; Max-Age=0`;

  let result: { token?: string; error?: string } = {};
  if (!code || !state || state !== cookieState) {
    result = { error: 'The sign-in state did not match; please try again.' };
  } else {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'connectedpnw-content-service' },
      body: JSON.stringify({
        client_id: env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: `${env.SERVICE_URL}/callback`,
      }),
    });
    const data = (await res.json()) as { access_token?: string; error_description?: string };
    result = data.access_token ? { token: data.access_token } : { error: data.error_description ?? 'GitHub sign-in failed.' };
  }

  const status = result.token ? 'success' : 'error';
  const payload = JSON.stringify(result.token ? { token: result.token, provider: 'github' } : { error: result.error, provider: 'github' });
  // Only the website itself may receive the token.
  const allowedOrigins = JSON.stringify([env.SITE_URL, 'http://localhost:4321']);
  const script = `
    (function () {
      var allowed = ${allowedOrigins};
      var message = 'authorization:github:${status}:' + ${JSON.stringify(payload)};
      function receive(e) {
        if (allowed.indexOf(e.origin) === -1 || e.data !== 'authorizing:github') return;
        window.removeEventListener('message', receive);
        window.opener.postMessage(message, e.origin);
      }
      if (!window.opener) { document.body.textContent = 'Open this from the /admin page.'; return; }
      window.addEventListener('message', receive);
      window.opener.postMessage('authorizing:github', '*');
    })();`;
  const body = result.token
    ? '<p>Signed in. You can close this window.</p>'
    : `<p>${escape(result.error ?? 'Sign-in failed.')}</p>`;
  return htmlPage('Signing in…', body, result.token ? 200 : 400, { 'Set-Cookie': clearCookie }, script);
}
