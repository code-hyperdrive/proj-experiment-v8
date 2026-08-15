import { Hono, type Context } from 'hono';
import type { Env, Vars } from '../types';
import { requireAuth } from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { generateSessionToken, hashToken, SESSION_TTL_MS } from '../lib/session';
import { generatePkcePair, decodeJwtPayload, exchangeGoogleCode, GOOGLE_PROVIDER } from '../lib/oauth';
import {
  createAnonymousUserWithSession,
  createSessionForUser,
  findOrCreateProviderUser,
  findSessionByTokenHash,
  getUser,
  recordNewUserStats,
  deleteSession,
} from '../lib/db';

const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

// Public — creates a brand-new anonymous identity. Rate-limited by source
// IP (not uid, since there isn't one yet) to deter someone scripting mass
// account creation.
auth.post(
  '/anonymous',
  rateLimit({ limit: 10, windowSeconds: 60, keyFn: (c) => `ip:${c.req.header('CF-Connecting-IP') ?? 'unknown'}` }),
  async (c) => {
    const userId = crypto.randomUUID();
    const rawToken = generateSessionToken();
    const tokenHash = await hashToken(rawToken);
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;

    await createAnonymousUserWithSession(c.env.DB, { userId, tokenHash, now, expiresAt });
    const globalStats = await recordNewUserStats(c.env.DB);

    return c.json({ userId, sessionToken: rawToken, expiresAt, globalStats }, 201);
  }
);

// Real, immediate revocation — deletes the session row outright (unlike a
// self-verified JWT, which can't be revoked before it expires without a
// separate blocklist).
auth.post('/logout', requireAuth(), async (c) => {
  await deleteSession(c.env.DB, c.get('tokenHash'));
  return c.json({ success: true });
});

const OAUTH_STATE_TTL_SECONDS = 600; // 10 minutes — plenty of time to complete the Google consent screen

// Starts the Google OAuth Authorization Code + PKCE flow. Public (no
// requireAuth — there's no session yet if this is a first-time sign-in).
// If the browser already has an active *anonymous* session, pass it as
// ?sessionToken=<token> and, on successful sign-in, that account's
// favorites/history/preferences carry over onto the resulting Google
// account (same row, converted in place — see linkAnonymousUserToProvider).
// A plain top-level redirect can't carry an Authorization header, which is
// why this is a query param rather than the usual Bearer header.
auth.get(
  '/google/start',
  rateLimit({ limit: 20, windowSeconds: 60, keyFn: (c) => `ip:${c.req.header('CF-Connecting-IP') ?? 'unknown'}` }),
  async (c) => {
    let anonymousUserId: string | null = null;
    const existingToken = c.req.query('sessionToken');
    if (existingToken) {
      const tokenHash = await hashToken(existingToken);
      const session = await findSessionByTokenHash(c.env.DB, tokenHash);
      if (session && session.expiresAt > Date.now()) {
        const user = await getUser(c.env.DB, session.userId);
        if (user && user.is_anonymous) {
          anonymousUserId = session.userId;
        }
      }
      // An invalid/expired/non-anonymous token is silently ignored here
      // rather than rejected — worst case, sign-in proceeds without
      // linking, which is exactly what happens with no token supplied.
    }

    const { codeVerifier, codeChallenge } = await generatePkcePair();
    const state = generateSessionToken();

    // Get the redirect path from query param (defaults to root)
    const redirectPath = c.req.query('redirectPath') || '/';

    await c.env.RATE_LIMIT_KV.put(
      `oauth:${state}`,
      JSON.stringify({ codeVerifier, anonymousUserId, redirectPath }),
      { expirationTtl: OAUTH_STATE_TTL_SECONDS }
    );

    const params = new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID,
      redirect_uri: c.env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'online',
      prompt: 'select_account',
    });

    return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  }
);

// Google redirects back here with ?code&state (or ?error on
// denial/failure). On completion (success OR failure) this redirects
// back to the FRONTEND (index.html or admin.html), not the caller of this route
// directly — mirroring how app.js's checkSharedData() already reads
// one-time params off the URL and strips them via history.replaceState.
// Success appends ?sessionToken=&userId=&isNewUser=&wasLinked=; failure
// appends ?authError=<message> instead, so the frontend can show a toast
// rather than a user ever seeing raw JSON in their browser.
function redirectWithAuthError(c: Context<{ Bindings: Env; Variables: Vars }>, message: string, redirectPath?: string) {
  const finalPath = redirectPath || '/';
  return c.redirect(`${c.env.FRONTEND_ORIGIN}${finalPath}?authError=${encodeURIComponent(message)}`);
}

auth.get(
  '/google/callback',
  rateLimit({ limit: 20, windowSeconds: 60, keyFn: (c) => `ip:${c.req.header('CF-Connecting-IP') ?? 'unknown'}` }),
  async (c) => {
    const error = c.req.query('error');
    if (error) {
      return redirectWithAuthError(c, `Google sign-in was not completed: ${error}`);
    }

    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!code || !state) {
      return redirectWithAuthError(c, 'Missing code or state');
    }

    const stateKey = `oauth:${state}`;
    const stateRaw = await c.env.RATE_LIMIT_KV.get(stateKey);
    if (!stateRaw) {
      return redirectWithAuthError(c, 'Your sign-in link expired — please try again');
    }
    await c.env.RATE_LIMIT_KV.delete(stateKey); // one-time use, regardless of what happens next

    const { codeVerifier, anonymousUserId, redirectPath } = JSON.parse(stateRaw) as {
      codeVerifier: string;
      anonymousUserId: string | null;
      redirectPath?: string;
    };

    let tokenResponse;
    try {
      tokenResponse = await exchangeGoogleCode(c.env, code, codeVerifier);
    } catch (err) {
      console.error('Google token exchange failed:', err);
      return redirectWithAuthError(c, 'Could not complete Google sign-in', redirectPath);
    }

    const payload = decodeJwtPayload(tokenResponse.id_token);
    if (!payload.sub) {
      return redirectWithAuthError(c, 'Google did not return a subject claim');
    }

    const { user, wasLinked, isNewUser } = await findOrCreateProviderUser(
      c.env.DB,
      {
        provider: GOOGLE_PROVIDER,
        providerUserId: payload.sub,
        email: payload.email ?? null,
        displayName: payload.name ?? null,
        avatarUrl: payload.picture ?? null,
      },
      anonymousUserId
    );

    const rawToken = generateSessionToken();
    const tokenHash = await hashToken(rawToken);
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    await createSessionForUser(c.env.DB, { userId: user.id, tokenHash, now, expiresAt });

    if (isNewUser) {
      await recordNewUserStats(c.env.DB);
    }

    const params = new URLSearchParams({
      sessionToken: rawToken,
      userId: user.id,
      isNewUser: String(isNewUser),
      wasLinked: String(wasLinked),
    });
    const finalPath = redirectPath || '/';
    return c.redirect(`${c.env.FRONTEND_ORIGIN}${finalPath}?${params.toString()}`);
  }
);

export default auth;
