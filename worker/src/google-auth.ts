// The /authorize endpoint. An MCP client (Claude, ChatGPT) sends the editor
// here; we bounce them through Google sign-in, check the allowlist, and hand
// the result back to the OAuth provider, which issues the client its tokens.
import { AuthorizationError, type AuthRequest } from '@cloudflare/workers-oauth-provider';
import { allowedEmails, type EditorProps, type Env } from './env';
import { htmlPage } from './pages';

export const GOOGLE_CALLBACK_PATH = '/callback/google';
const STATE_TTL_SECONDS = 600;

export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  let authReq: AuthRequest;
  try {
    authReq = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    if (!error.redirectUri) return htmlPage('Sign-in problem', `<p>${escape(error.description)}</p>`, 400);
    const redirect = new URL(error.redirectUri);
    redirect.searchParams.set('error', error.code);
    redirect.searchParams.set('error_description', error.description);
    if (error.state) redirect.searchParams.set('state', error.state);
    if (error.issuer) redirect.searchParams.set('iss', error.issuer);
    return Response.redirect(redirect.toString(), 302);
  }

  const client = await env.OAUTH_PROVIDER.lookupClient(authReq.clientId);
  if (!client) return htmlPage('Sign-in problem', '<p>Unknown app. Please reconnect from Claude or ChatGPT.</p>', 400);

  const state = crypto.randomUUID();
  await env.OAUTH_KV.put(
    `login-state:${state}`,
    JSON.stringify({ authReq, clientName: client.clientName ?? 'an app' }),
    { expirationTtl: STATE_TTL_SECONDS },
  );

  const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  google.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  google.searchParams.set('redirect_uri', `${env.SERVICE_URL}${GOOGLE_CALLBACK_PATH}`);
  google.searchParams.set('response_type', 'code');
  google.searchParams.set('scope', 'openid email profile');
  google.searchParams.set('state', state);
  google.searchParams.set('prompt', 'select_account');
  return Response.redirect(google.toString(), 302);
}

export async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code');
  const stored = state ? await env.OAUTH_KV.get(`login-state:${state}`) : null;
  if (!stored) return htmlPage('Sign-in expired', '<p>This sign-in link has expired. Please start again from Claude or ChatGPT.</p>', 400);
  await env.OAUTH_KV.delete(`login-state:${state}`);
  if (!code) return htmlPage('Sign-in cancelled', '<p>Google sign-in was cancelled.</p>', 400);

  const { authReq, clientName } = JSON.parse(stored) as { authReq: AuthRequest; clientName: string };

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.SERVICE_URL}${GOOGLE_CALLBACK_PATH}`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return htmlPage('Sign-in problem', '<p>Google did not accept the sign-in. Please try again.</p>', 502);
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) return htmlPage('Sign-in problem', '<p>Google did not return an identity. Please try again.</p>', 502);

  // The ID token came straight from Google over TLS in the code exchange, so
  // its signature does not need checking here; we still check who it is for.
  const claims = decodeJwtPayload(id_token) as {
    aud?: string; iss?: string; email?: string; email_verified?: boolean; name?: string;
  };
  const okIssuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  if (!okIssuer || claims.aud !== env.GOOGLE_CLIENT_ID || !claims.email || claims.email_verified !== true) {
    return htmlPage('Sign-in problem', '<p>Could not verify the Google account.</p>', 400);
  }

  const email = claims.email.toLowerCase();
  if (!allowedEmails(env).includes(email)) {
    return htmlPage(
      'Not on the editor list',
      `<p><strong>${escape(email)}</strong> is not on the list of website editors.</p>
       <p>If this is you, ask the site's developer to add this address. Otherwise go back and sign in with the Google account that was set up for you.</p>`,
      403,
    );
  }

  const props: EditorProps = {
    email,
    name: claims.name?.trim() || email.split('@')[0],
    client: clientName,
  };
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: authReq,
    userId: email,
    metadata: { clientName, email },
    scope: authReq.scope,
    props,
  });
  return Response.redirect(redirectTo, 302);
}

function decodeJwtPayload(jwt: string): unknown {
  const part = jwt.split('.')[1] ?? '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
}

export function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
