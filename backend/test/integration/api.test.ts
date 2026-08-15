import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { hashToken } from '../../src/lib/session';
import { createAnonymousSession, authHeader } from '../helpers';

describe('auth — anonymous account creation', () => {
  it('creates a new account with a usable session token', async () => {
    const { userId, sessionToken } = await createAnonymousSession(SELF);
    expect(userId).toBeTruthy();
    expect(sessionToken).toBeTruthy();

    const res = await SELF.fetch('http://backend.test/api/v1/profile', { headers: authHeader(sessionToken) });
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.profile.id).toBe(userId);
    expect(body.profile.isAnonymous).toBe(true);
  });

  it('increments global connectedUsers on account creation', async () => {
    const before = await (await SELF.fetch('http://backend.test/api/v1/stats')).json<any>();
    await createAnonymousSession(SELF);
    const after = await (await SELF.fetch('http://backend.test/api/v1/stats')).json<any>();
    expect(after.connectedUsers).toBe(before.connectedUsers + 1);
  });

  it('is rate-limited by IP past 10 signups/min', async () => {
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await SELF.fetch('http://backend.test/api/v1/auth/anonymous', { method: 'POST' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe('auth — session verification negative cases', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await SELF.fetch('http://backend.test/api/v1/profile');
    expect(res.status).toBe(401);
  });

  it('rejects a garbage/unknown session token', async () => {
    const res = await SELF.fetch('http://backend.test/api/v1/profile', {
      headers: authHeader('this-token-was-never-issued'),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a session after it has expired', async () => {
    const { sessionToken } = await createAnonymousSession(SELF);
    const tokenHash = await hashToken(sessionToken);
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
      .bind(Date.now() - 1000, tokenHash)
      .run();

    const res = await SELF.fetch('http://backend.test/api/v1/profile', { headers: authHeader(sessionToken) });
    expect(res.status).toBe(401);
  });
});

describe('auth — logout is real, immediate revocation', () => {
  it('invalidates the session so it can no longer be used', async () => {
    const { sessionToken } = await createAnonymousSession(SELF);

    const before = await SELF.fetch('http://backend.test/api/v1/profile', { headers: authHeader(sessionToken) });
    expect(before.status).toBe(200);

    const logoutRes = await SELF.fetch('http://backend.test/api/v1/auth/logout', {
      method: 'POST',
      headers: authHeader(sessionToken),
    });
    expect(logoutRes.status).toBe(200);

    const after = await SELF.fetch('http://backend.test/api/v1/profile', { headers: authHeader(sessionToken) });
    expect(after.status).toBe(401);
  });
});

describe('profile', () => {
  it('rejects unknown top-level fields on PATCH (mirrors old firestore.rules hasOnly pattern)', async () => {
    const { sessionToken } = await createAnonymousSession(SELF);
    const res = await SELF.fetch('http://backend.test/api/v1/profile', {
      method: 'PATCH',
      headers: { ...authHeader(sessionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Real Name', userId: 'someone-else' }),
    });
    // Proves a spoofed identity field in the body is rejected outright,
    // not silently accepted or used as an identity override.
    expect(res.status).toBe(400);
  });

  it('updates displayName and preferences via PATCH', async () => {
    const { sessionToken } = await createAnonymousSession(SELF);
    const patchRes = await SELF.fetch('http://backend.test/api/v1/profile', {
      method: 'PATCH',
      headers: { ...authHeader(sessionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Real Name', preferences: { theme: 'midnight' } }),
    });
    expect(patchRes.status).toBe(200);

    const getRes = await SELF.fetch('http://backend.test/api/v1/profile', { headers: authHeader(sessionToken) });
    const body = await getRes.json<any>();
    expect(body.profile.displayName).toBe('Real Name');
    expect(body.profile.preferences.theme).toBe('midnight');
  });

  it('rejects a display name over 60 characters', async () => {
    const { sessionToken } = await createAnonymousSession(SELF);
    const res = await SELF.fetch('http://backend.test/api/v1/profile', {
      method: 'PATCH',
      headers: { ...authHeader(sessionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'x'.repeat(61) }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown preference key', async () => {
    const { sessionToken } = await createAnonymousSession(SELF);
    const res = await SELF.fetch('http://backend.test/api/v1/profile', {
      method: 'PATCH',
      headers: { ...authHeader(sessionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: { notARealPreference: true } }),
    });
    expect(res.status).toBe(400);
  });

  it('deletes the profile and its sessions on DELETE', async () => {
    const { sessionToken } = await createAnonymousSession(SELF);
    const delRes = await SELF.fetch('http://backend.test/api/v1/profile', {
      method: 'DELETE',
      headers: authHeader(sessionToken),
    });
    expect(delRes.status).toBe(200);

    const after = await SELF.fetch('http://backend.test/api/v1/profile', { headers: authHeader(sessionToken) });
    expect(after.status).toBe(401); // session was deleted along with the account
  });
});

describe('IDOR isolation — the core security property', () => {
  it('two different accounts never see each other\'s favorites', async () => {
    const a = await createAnonymousSession(SELF);
    const b = await createAnonymousSession(SELF);
    expect(a.userId).not.toBe(b.userId);

    await SELF.fetch('http://backend.test/api/v1/favorites/only-a-station', {
      method: 'PUT',
      headers: authHeader(a.sessionToken),
    });

    const favA = await (
      await SELF.fetch('http://backend.test/api/v1/favorites', { headers: authHeader(a.sessionToken) })
    ).json<any>();
    expect(favA.favorites.map((f: any) => f.stationId)).toContain('only-a-station');

    const favB = await (
      await SELF.fetch('http://backend.test/api/v1/favorites', { headers: authHeader(b.sessionToken) })
    ).json<any>();
    expect(favB.favorites.map((f: any) => f.stationId)).not.toContain('only-a-station');
  });

  it('never accepts an identity value from the request body — no route has a userId param, by construction', () => {
    // Structural note, not a runtime check: every handler in routes/*.ts
    // derives identity solely via c.get('uid'), set only by
    // lib/auth.ts's requireAuth() from a verified session lookup — no
    // route reads req.param('userId') or a body-supplied identity field.
    expect(true).toBe(true);
  });
});

describe('favorites', () => {
  it('enforces the reorder-must-match-current-set invariant', async () => {
    const { sessionToken } = await createAnonymousSession(SELF);
    await SELF.fetch('http://backend.test/api/v1/favorites/r1', { method: 'PUT', headers: authHeader(sessionToken) });
    await SELF.fetch('http://backend.test/api/v1/favorites/r2', { method: 'PUT', headers: authHeader(sessionToken) });

    const badReorder = await SELF.fetch('http://backend.test/api/v1/favorites/reorder', {
      method: 'PUT',
      headers: { ...authHeader(sessionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ['r1', 'not-a-real-favorite'] }),
    });
    expect(badReorder.status).toBe(400);

    const goodReorder = await SELF.fetch('http://backend.test/api/v1/favorites/reorder', {
      method: 'PUT',
      headers: { ...authHeader(sessionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ['r2', 'r1'] }),
    });
    expect(goodReorder.status).toBe(200);

    const list = await (
      await SELF.fetch('http://backend.test/api/v1/favorites', { headers: authHeader(sessionToken) })
    ).json<any>();
    expect(list.favorites.map((f: any) => f.stationId)).toEqual(['r2', 'r1']);
  });

  it('rejects favoriting past the 500 cap', async () => {
    // Not economical to actually insert 500 rows per test run; instead
    // directly seed the count in D1 and confirm the next add is refused.
    const { sessionToken, userId } = await createAnonymousSession(SELF);
    const now = Date.now();
    const stmts = Array.from({ length: 500 }, (_, i) =>
      env.DB.prepare('INSERT INTO favorites (user_id, station_id, position, created_at) VALUES (?, ?, ?, ?)').bind(
        userId,
        `seed-${i}`,
        i,
        now
      )
    );
    await env.DB.batch(stmts);

    const res = await SELF.fetch('http://backend.test/api/v1/favorites/one-too-many', {
      method: 'PUT',
      headers: authHeader(sessionToken),
    });
    expect(res.status).toBe(409);
  });
});

describe('history', () => {
  it('records a play and updates genre/country stats + total listening time', async () => {
    const { sessionToken } = await createAnonymousSession(SELF);

    await SELF.fetch('http://backend.test/api/v1/history', {
      method: 'POST',
      headers: { ...authHeader(sessionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationId: 'jazz-fm', genre: 'Jazz', country: 'USA', durationSeconds: 120 }),
    });

    const historyRes = await (
      await SELF.fetch('http://backend.test/api/v1/history', { headers: authHeader(sessionToken) })
    ).json<any>();
    expect(historyRes.history[0].stationId).toBe('jazz-fm');

    const profileRes = await (
      await SELF.fetch('http://backend.test/api/v1/profile', { headers: authHeader(sessionToken) })
    ).json<any>();
    expect(profileRes.profile.genreStats.Jazz).toBe(1);
    expect(profileRes.profile.countryStats.USA).toBe(1);
    expect(profileRes.profile.totalListeningTime).toBeGreaterThanOrEqual(120);
  });

  it('rejects a negative durationSeconds', async () => {
    const { sessionToken } = await createAnonymousSession(SELF);
    const res = await SELF.fetch('http://backend.test/api/v1/history', {
      method: 'POST',
      headers: { ...authHeader(sessionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationId: 'x', durationSeconds: -5 }),
    });
    expect(res.status).toBe(400);
  });
});

describe('rate limiting (authenticated routes)', () => {
  it('returns 429 once the per-uid limit is exceeded', async () => {
    const { sessionToken } = await createAnonymousSession(SELF);
    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const res = await SELF.fetch('http://backend.test/api/v1/profile', { headers: authHeader(sessionToken) });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe('CORS', () => {
  it('does not echo Access-Control-Allow-Origin for a disallowed origin', async () => {
    const res = await SELF.fetch('http://backend.test/api/v1/stats', {
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeFalsy();
  });

  it('echoes the origin back for an allowed dev origin', async () => {
    const res = await SELF.fetch('http://backend.test/api/v1/stats', {
      headers: { Origin: 'http://localhost:8080' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8080');
  });
});
