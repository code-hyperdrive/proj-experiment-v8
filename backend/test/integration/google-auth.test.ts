import { describe, it, expect, afterEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { __setGoogleTokenExchangeForTesting } from '../../src/lib/oauth';
import { createAnonymousSession, authHeader } from '../helpers';

function makeFakeIdToken(payload: Record<string, unknown>): string {
  const toBase64Url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${toBase64Url({ alg: 'RS256' })}.${toBase64Url(payload)}.fake-sig`;
}

/** Extracts ?state= from the redirect Location header /google/start returns. */
function extractState(location: string): string {
  return new URL(location).searchParams.get('state')!;
}

/** The callback redirects to FRONTEND_ORIGIN on both success and failure — parse whichever params matter. */
function parseCallbackRedirect(location: string) {
  const url = new URL(location);
  expect(url.origin + url.pathname).toBe(env.FRONTEND_ORIGIN + '/');
  return {
    sessionToken: url.searchParams.get('sessionToken'),
    userId: url.searchParams.get('userId'),
    isNewUser: url.searchParams.get('isNewUser'),
    wasLinked: url.searchParams.get('wasLinked'),
    authError: url.searchParams.get('authError'),
  };
}

afterEach(() => {
  __setGoogleTokenExchangeForTesting(undefined);
});

describe('GET /api/v1/auth/google/start', () => {
  it('redirects to Google\'s real OAuth endpoint with the expected params', async () => {
    const res = await SELF.fetch('http://backend.test/api/v1/auth/google/start', { redirect: 'manual' });
    expect(res.status).toBe(302);
    const location = res.headers.get('Location')!;
    expect(location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    const url = new URL(location);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toContain('email');
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('is rate-limited by IP past 20 requests/min', async () => {
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const res = await SELF.fetch('http://backend.test/api/v1/auth/google/start', { redirect: 'manual' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe('GET /api/v1/auth/google/callback', () => {
  it('redirects to the frontend with authError when there is no code/state', async () => {
    const res = await SELF.fetch('http://backend.test/api/v1/auth/google/callback', { redirect: 'manual' });
    expect(res.status).toBe(302);
    const { authError } = parseCallbackRedirect(res.headers.get('Location')!);
    expect(authError).toBeTruthy();
  });

  it('redirects with authError on an unknown/expired state', async () => {
    const res = await SELF.fetch('http://backend.test/api/v1/auth/google/callback?code=abc&state=never-issued', {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    const { authError } = parseCallbackRedirect(res.headers.get('Location')!);
    expect(authError).toBeTruthy();
  });

  it('surfaces a Google-side error param as authError, without crashing', async () => {
    const res = await SELF.fetch('http://backend.test/api/v1/auth/google/callback?error=access_denied', {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    const { authError } = parseCallbackRedirect(res.headers.get('Location')!);
    expect(authError).toContain('access_denied');
  });

  it('completes a fresh sign-in (no prior anonymous session) end to end', async () => {
    __setGoogleTokenExchangeForTesting(async () => ({
      id_token: makeFakeIdToken({
        sub: 'google-sub-fresh',
        email: 'fresh@example.com',
        name: 'Fresh User',
        picture: 'https://lh3.googleusercontent.com/a/fresh-user-pic',
      }),
      access_token: 'unused',
    }));

    const startRes = await SELF.fetch('http://backend.test/api/v1/auth/google/start', { redirect: 'manual' });
    const state = extractState(startRes.headers.get('Location')!);

    const callbackRes = await SELF.fetch(
      `http://backend.test/api/v1/auth/google/callback?code=fake-code&state=${state}`,
      { redirect: 'manual' }
    );
    expect(callbackRes.status).toBe(302);
    const { sessionToken, userId, isNewUser, wasLinked, authError } = parseCallbackRedirect(
      callbackRes.headers.get('Location')!
    );
    expect(authError).toBeNull();
    expect(sessionToken).toBeTruthy();
    expect(isNewUser).toBe('true');
    expect(wasLinked).toBe('false');

    // The returned session is real and usable, and the profile it points at is correct.
    const profileRes = await SELF.fetch('http://backend.test/api/v1/profile', {
      headers: authHeader(sessionToken!),
    });
    expect(profileRes.status).toBe(200);
    const profileBody = await profileRes.json<any>();
    expect(profileBody.profile.id).toBe(userId);
    expect(profileBody.profile.email).toBe('fresh@example.com');
    expect(profileBody.profile.isAnonymous).toBe(false);
    expect(profileBody.profile.avatarUrl).toBe('https://lh3.googleusercontent.com/a/fresh-user-pic');
  });

  it('a state token can only be used once (single-use)', async () => {
    __setGoogleTokenExchangeForTesting(async () => ({
      id_token: makeFakeIdToken({ sub: 'google-sub-once', email: 'once@example.com' }),
      access_token: 'unused',
    }));

    const startRes = await SELF.fetch('http://backend.test/api/v1/auth/google/start', { redirect: 'manual' });
    const state = extractState(startRes.headers.get('Location')!);

    const first = await SELF.fetch(`http://backend.test/api/v1/auth/google/callback?code=c1&state=${state}`, {
      redirect: 'manual',
    });
    expect(parseCallbackRedirect(first.headers.get('Location')!).authError).toBeNull();

    const second = await SELF.fetch(`http://backend.test/api/v1/auth/google/callback?code=c2&state=${state}`, {
      redirect: 'manual',
    });
    expect(parseCallbackRedirect(second.headers.get('Location')!).authError).toBeTruthy();
  });

  it('links an active anonymous session\'s data onto the new Google account', async () => {
    const anon = await createAnonymousSession(SELF);
    await SELF.fetch('http://backend.test/api/v1/favorites/carried-over-station', {
      method: 'PUT',
      headers: authHeader(anon.sessionToken),
    });

    __setGoogleTokenExchangeForTesting(async () => ({
      id_token: makeFakeIdToken({ sub: 'google-sub-link', email: 'link@example.com', name: 'Link Test' }),
      access_token: 'unused',
    }));

    const startRes = await SELF.fetch(
      `http://backend.test/api/v1/auth/google/start?sessionToken=${anon.sessionToken}`,
      { redirect: 'manual' }
    );
    const state = extractState(startRes.headers.get('Location')!);

    const callbackRes = await SELF.fetch(
      `http://backend.test/api/v1/auth/google/callback?code=fake-code&state=${state}`,
      { redirect: 'manual' }
    );
    const { sessionToken, userId, wasLinked } = parseCallbackRedirect(callbackRes.headers.get('Location')!);

    expect(wasLinked).toBe('true');
    expect(userId).toBe(anon.userId); // same account, upgraded in place

    const profileRes = await SELF.fetch('http://backend.test/api/v1/profile', { headers: authHeader(sessionToken!) });
    expect((await profileRes.json<any>()).profile.email).toBe('link@example.com');

    // Favorites added while anonymous are still there under the new session.
    const favRes = await SELF.fetch('http://backend.test/api/v1/favorites', { headers: authHeader(sessionToken!) });
    const favBody = await favRes.json<any>();
    expect(favBody.favorites.map((f: any) => f.stationId)).toContain('carried-over-station');
  });

  it('signing in again with the SAME Google identity returns the SAME account, not a duplicate', async () => {
    __setGoogleTokenExchangeForTesting(async () => ({
      id_token: makeFakeIdToken({ sub: 'google-sub-repeat', email: 'repeat@example.com' }),
      access_token: 'unused',
    }));

    const start1 = await SELF.fetch('http://backend.test/api/v1/auth/google/start', { redirect: 'manual' });
    const state1 = extractState(start1.headers.get('Location')!);
    const res1 = await SELF.fetch(`http://backend.test/api/v1/auth/google/callback?code=c1&state=${state1}`, {
      redirect: 'manual',
    });
    const body1 = parseCallbackRedirect(res1.headers.get('Location')!);

    const start2 = await SELF.fetch('http://backend.test/api/v1/auth/google/start', { redirect: 'manual' });
    const state2 = extractState(start2.headers.get('Location')!);
    const res2 = await SELF.fetch(`http://backend.test/api/v1/auth/google/callback?code=c2&state=${state2}`, {
      redirect: 'manual',
    });
    const body2 = parseCallbackRedirect(res2.headers.get('Location')!);

    expect(body2.userId).toBe(body1.userId);
    expect(body2.isNewUser).toBe('false');
  });

  it('a token-exchange failure redirects with authError, not a raw 502 page', async () => {
    __setGoogleTokenExchangeForTesting(async () => {
      throw new Error('simulated network failure');
    });

    const startRes = await SELF.fetch('http://backend.test/api/v1/auth/google/start', { redirect: 'manual' });
    const state = extractState(startRes.headers.get('Location')!);
    const res = await SELF.fetch(`http://backend.test/api/v1/auth/google/callback?code=c&state=${state}`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(parseCallbackRedirect(res.headers.get('Location')!).authError).toBeTruthy();
  });
});
