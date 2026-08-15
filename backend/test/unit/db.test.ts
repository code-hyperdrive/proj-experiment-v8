import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  rowToProfile,
  getUser,
  createAnonymousUserWithSession,
  findSessionByTokenHash,
  touchSession,
  deleteSession,
  updateProfile,
  deleteUser,
  listFavorites,
  addFavorite,
  removeFavorite,
  reorderFavorites,
  addHistoryEntry,
  listHistory,
  getGlobalStats,
  recordNewUserStats,
  recordDailyActivityAndGetStats,
  findUserByProvider,
  linkAnonymousUserToProvider,
  createProviderUser,
  createSessionForUser,
  findOrCreateProviderUser,
  type UserRow,
} from '../../src/lib/db';
import { NotFoundError, ConflictError, LimitExceededError, ValidationError } from '../../src/lib/errors';

/** Creates a fresh user + session directly via the DB layer (not HTTP) for tests to build on. */
async function createTestUser(): Promise<{ userId: string; tokenHash: string }> {
  const userId = crypto.randomUUID();
  const tokenHash = crypto.randomUUID(); // stands in for a real SHA-256 hash — db.ts doesn't care about its shape
  await createAnonymousUserWithSession(env.DB, { userId, tokenHash, now: Date.now(), expiresAt: Date.now() + 1000000 });
  return { userId, tokenHash };
}

describe('rowToProfile', () => {
  it('maps a raw D1 row to the camelCase API shape, parsing JSON columns', () => {
    const row: UserRow = {
      id: 'u1',
      custom_id: 'myhandle',
      display_name: 'Ram',
      is_anonymous: 1,
      sign_in_provider: 'anonymous',
      email: null,
      provider_user_id: null,
      avatar_url: null,
      created_at: 1000,
      last_sync_at: 2000,
      last_active_date: '2026-01-01',
      preferences_json: '{"theme":"midnight"}',
      genre_stats_json: '{"Jazz":2}',
      country_stats_json: '{"USA":1}',
      total_listening_time: 300,
    };
    expect(rowToProfile(row)).toEqual({
      id: 'u1',
      customId: 'myhandle',
      displayName: 'Ram',
      isAnonymous: true,
      signInProvider: 'anonymous',
      email: null,
      avatarUrl: null,
      createdAt: 1000,
      lastSyncAt: 2000,
      preferences: { theme: 'midnight' },
      genreStats: { Jazz: 2 },
      countryStats: { USA: 1 },
      totalListeningTime: 300,
    });
  });

  it('maps is_anonymous: 0 to isAnonymous: false', () => {
    const row: UserRow = {
      id: 'u1', custom_id: null, display_name: null, is_anonymous: 0, sign_in_provider: 'google.com',
      email: 'ram@example.com', provider_user_id: 'google-sub-123', avatar_url: 'https://example.com/pic.jpg',
      created_at: 0, last_sync_at: null, last_active_date: null,
      preferences_json: '{}', genre_stats_json: '{}', country_stats_json: '{}', total_listening_time: 0,
    };
    expect(rowToProfile(row).isAnonymous).toBe(false);
    expect(rowToProfile(row).email).toBe('ram@example.com');
    expect(rowToProfile(row).avatarUrl).toBe('https://example.com/pic.jpg');
  });

  it('defaults malformed/empty JSON columns to empty objects rather than throwing', () => {
    const row: UserRow = {
      id: 'u1', custom_id: null, display_name: null, is_anonymous: 1, sign_in_provider: 'anonymous',
      email: null, provider_user_id: null, avatar_url: null,
      created_at: 0, last_sync_at: null, last_active_date: null,
      preferences_json: '', genre_stats_json: '', country_stats_json: '', total_listening_time: 0,
    };
    expect(rowToProfile(row).preferences).toEqual({});
  });
});

describe('getUser / createAnonymousUserWithSession', () => {
  it('returns null for a uid that does not exist', async () => {
    expect(await getUser(env.DB, 'no-such-user')).toBeNull();
  });

  it('creates a user with anonymous defaults', async () => {
    const { userId } = await createTestUser();
    const user = await getUser(env.DB, userId);
    expect(user).not.toBeNull();
    expect(user!.id).toBe(userId);
    expect(user!.is_anonymous).toBe(1);
    expect(user!.sign_in_provider).toBe('anonymous');
    expect(user!.preferences_json).toBe('{}');
    expect(user!.total_listening_time).toBe(0);
  });

  it('sets last_active_date to the creation day (UTC)', async () => {
    const { userId } = await createTestUser();
    const user = await getUser(env.DB, userId);
    const today = new Date().toISOString().split('T')[0];
    expect(user!.last_active_date).toBe(today);
  });

  it('also creates a usable session row in the same call', async () => {
    const { userId, tokenHash } = await createTestUser();
    const session = await findSessionByTokenHash(env.DB, tokenHash);
    expect(session).toEqual({ userId, expiresAt: expect.any(Number) });
  });
});

describe('findSessionByTokenHash / touchSession / deleteSession', () => {
  it('returns null for an unknown token hash', async () => {
    expect(await findSessionByTokenHash(env.DB, 'never-issued')).toBeNull();
  });

  it('touchSession updates last_seen_at and expires_at', async () => {
    const { tokenHash } = await createTestUser();
    const newExpiry = Date.now() + 5_000_000;
    await touchSession(env.DB, tokenHash, newExpiry);
    const session = await findSessionByTokenHash(env.DB, tokenHash);
    expect(session!.expiresAt).toBe(newExpiry);
  });

  it('deleteSession removes the row so it can no longer be found', async () => {
    const { tokenHash } = await createTestUser();
    await deleteSession(env.DB, tokenHash);
    expect(await findSessionByTokenHash(env.DB, tokenHash)).toBeNull();
  });

  it('deleteSession on an already-missing hash does not throw', async () => {
    await expect(deleteSession(env.DB, 'not-there')).resolves.not.toThrow();
  });
});

describe('updateProfile', () => {
  it('throws NotFoundError for a uid with no profile', async () => {
    await expect(updateProfile(env.DB, 'ghost', { displayName: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('updates displayName', async () => {
    const { userId } = await createTestUser();
    await updateProfile(env.DB, userId, { displayName: 'New Name' });
    expect((await getUser(env.DB, userId))!.display_name).toBe('New Name');
  });

  it('updates customId', async () => {
    const { userId } = await createTestUser();
    await updateProfile(env.DB, userId, { customId: 'uniquehandle' });
    expect((await getUser(env.DB, userId))!.custom_id).toBe('uniquehandle');
  });

  it('merges preferences rather than replacing the whole object', async () => {
    const { userId } = await createTestUser();
    await updateProfile(env.DB, userId, { preferences: { theme: 'midnight' } });
    await updateProfile(env.DB, userId, { preferences: { language: 'fr' } });
    const user = await getUser(env.DB, userId);
    expect(JSON.parse(user!.preferences_json)).toEqual({ theme: 'midnight', language: 'fr' });
  });

  it('a later preference update overwrites the same key', async () => {
    const { userId } = await createTestUser();
    await updateProfile(env.DB, userId, { preferences: { theme: 'midnight' } });
    await updateProfile(env.DB, userId, { preferences: { theme: 'light' } });
    const user = await getUser(env.DB, userId);
    expect(JSON.parse(user!.preferences_json)).toEqual({ theme: 'light' });
  });

  it('throws ConflictError when customId is already taken by another user', async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await updateProfile(env.DB, a.userId, { customId: 'takenhandle' });
    await expect(updateProfile(env.DB, b.userId, { customId: 'takenhandle' })).rejects.toThrow(ConflictError);
  });

  it('a no-op patch (empty object) does not throw and does not bump last_sync_at', async () => {
    const { userId } = await createTestUser();
    const before = (await getUser(env.DB, userId))!.last_sync_at;
    await updateProfile(env.DB, userId, {});
    const after = (await getUser(env.DB, userId))!.last_sync_at;
    expect(after).toBe(before);
  });
});

describe('deleteUser', () => {
  it('removes the user row', async () => {
    const { userId } = await createTestUser();
    await deleteUser(env.DB, userId);
    expect(await getUser(env.DB, userId)).toBeNull();
  });

  it('cascades to sessions — the session can no longer authenticate', async () => {
    const { userId, tokenHash } = await createTestUser();
    await deleteUser(env.DB, userId);
    expect(await findSessionByTokenHash(env.DB, tokenHash)).toBeNull();
  });

  it('cascades to favorites', async () => {
    const { userId } = await createTestUser();
    await addFavorite(env.DB, userId, 'station-1');
    await deleteUser(env.DB, userId);
    const { results } = await env.DB.prepare('SELECT * FROM favorites WHERE user_id = ?').bind(userId).all();
    expect(results).toHaveLength(0);
  });

  it('cascades to history', async () => {
    const { userId } = await createTestUser();
    await addHistoryEntry(env.DB, userId, { stationId: 'station-1', durationSeconds: 10 });
    await deleteUser(env.DB, userId);
    const { results } = await env.DB.prepare('SELECT * FROM history WHERE user_id = ?').bind(userId).all();
    expect(results).toHaveLength(0);
  });
});

describe('favorites: listFavorites / addFavorite / removeFavorite / reorderFavorites', () => {
  it('starts empty for a new user', async () => {
    const { userId } = await createTestUser();
    expect(await listFavorites(env.DB, userId)).toEqual([]);
  });

  it('addFavorite adds a new entry', async () => {
    const { userId } = await createTestUser();
    const result = await addFavorite(env.DB, userId, 'station-1');
    expect(result).toEqual({ added: true, alreadyExists: false });
    const list = await listFavorites(env.DB, userId);
    expect(list.map((f) => f.stationId)).toEqual(['station-1']);
  });

  it('addFavorite is idempotent — adding the same station twice reports alreadyExists', async () => {
    const { userId } = await createTestUser();
    await addFavorite(env.DB, userId, 'station-1');
    const result = await addFavorite(env.DB, userId, 'station-1');
    expect(result).toEqual({ added: false, alreadyExists: true });
    expect(await listFavorites(env.DB, userId)).toHaveLength(1);
  });

  it('lists favorites in insertion order by default', async () => {
    const { userId } = await createTestUser();
    await addFavorite(env.DB, userId, 'first');
    await addFavorite(env.DB, userId, 'second');
    await addFavorite(env.DB, userId, 'third');
    expect((await listFavorites(env.DB, userId)).map((f) => f.stationId)).toEqual(['first', 'second', 'third']);
  });

  it('removeFavorite removes exactly the targeted station', async () => {
    const { userId } = await createTestUser();
    await addFavorite(env.DB, userId, 'keep');
    await addFavorite(env.DB, userId, 'remove-me');
    await removeFavorite(env.DB, userId, 'remove-me');
    expect((await listFavorites(env.DB, userId)).map((f) => f.stationId)).toEqual(['keep']);
  });

  it('removeFavorite on a non-favorited station does not throw', async () => {
    const { userId } = await createTestUser();
    await expect(removeFavorite(env.DB, userId, 'never-added')).resolves.not.toThrow();
  });

  it('throws LimitExceededError at the favorites cap', async () => {
    const { userId } = await createTestUser();
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
    await expect(addFavorite(env.DB, userId, 'one-too-many')).rejects.toThrow(LimitExceededError);
  });

  it('reorderFavorites applies a new order', async () => {
    const { userId } = await createTestUser();
    await addFavorite(env.DB, userId, 'a');
    await addFavorite(env.DB, userId, 'b');
    await addFavorite(env.DB, userId, 'c');
    await reorderFavorites(env.DB, userId, ['c', 'a', 'b']);
    expect((await listFavorites(env.DB, userId)).map((f) => f.stationId)).toEqual(['c', 'a', 'b']);
  });

  it('reorderFavorites rejects an order missing an existing favorite', async () => {
    const { userId } = await createTestUser();
    await addFavorite(env.DB, userId, 'a');
    await addFavorite(env.DB, userId, 'b');
    await expect(reorderFavorites(env.DB, userId, ['a'])).rejects.toThrow(ValidationError);
  });

  it('reorderFavorites rejects an order containing a station that is not favorited', async () => {
    const { userId } = await createTestUser();
    await addFavorite(env.DB, userId, 'a');
    await expect(reorderFavorites(env.DB, userId, ['a', 'not-a-favorite'])).rejects.toThrow(ValidationError);
  });

  it('reorderFavorites rejects a duplicate entry standing in for a different one', async () => {
    const { userId } = await createTestUser();
    await addFavorite(env.DB, userId, 'a');
    await addFavorite(env.DB, userId, 'b');
    await expect(reorderFavorites(env.DB, userId, ['a', 'a'])).rejects.toThrow(ValidationError);
  });
});

describe('history: addHistoryEntry / listHistory', () => {
  it('records an entry retrievable via listHistory', async () => {
    const { userId } = await createTestUser();
    await addHistoryEntry(env.DB, userId, { stationId: 'jazz-fm', genre: 'Jazz', country: 'USA', durationSeconds: 120 });
    const history = await listHistory(env.DB, userId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ stationId: 'jazz-fm', genre: 'Jazz', country: 'USA', durationSeconds: 120 });
  });

  it('lists most-recent-first', async () => {
    const { userId } = await createTestUser();
    await addHistoryEntry(env.DB, userId, { stationId: 'first', durationSeconds: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await addHistoryEntry(env.DB, userId, { stationId: 'second', durationSeconds: 1 });
    const history = await listHistory(env.DB, userId);
    expect(history[0].stationId).toBe('second');
    expect(history[1].stationId).toBe('first');
  });

  it('increments genreStats and countryStats on the user profile', async () => {
    const { userId } = await createTestUser();
    await addHistoryEntry(env.DB, userId, { stationId: 'a', genre: 'Jazz', country: 'USA', durationSeconds: 10 });
    await addHistoryEntry(env.DB, userId, { stationId: 'b', genre: 'Jazz', country: 'UK', durationSeconds: 10 });
    const user = await getUser(env.DB, userId);
    expect(JSON.parse(user!.genre_stats_json)).toEqual({ Jazz: 2 });
    expect(JSON.parse(user!.country_stats_json)).toEqual({ USA: 1, UK: 1 });
  });

  it('accumulates totalListeningTime across multiple entries', async () => {
    const { userId } = await createTestUser();
    await addHistoryEntry(env.DB, userId, { stationId: 'a', durationSeconds: 100 });
    await addHistoryEntry(env.DB, userId, { stationId: 'b', durationSeconds: 50 });
    expect((await getUser(env.DB, userId))!.total_listening_time).toBe(150);
  });

  it('does not increment genre/country stats when they are omitted', async () => {
    const { userId } = await createTestUser();
    await addHistoryEntry(env.DB, userId, { stationId: 'a', durationSeconds: 10 });
    const user = await getUser(env.DB, userId);
    expect(JSON.parse(user!.genre_stats_json)).toEqual({});
    expect(JSON.parse(user!.country_stats_json)).toEqual({});
  });

  it('throws NotFoundError if the user row is somehow gone', async () => {
    await expect(addHistoryEntry(env.DB, 'ghost-user', { stationId: 'a', durationSeconds: 10 })).rejects.toThrow(
      NotFoundError
    );
  });

  it('trims history to the most-recent MAX_HISTORY (200) entries per user', async () => {
    const { userId } = await createTestUser();
    const now = Date.now();
    // Seed 205 rows directly (faster than 205 real addHistoryEntry calls),
    // all timestamped strictly in the PAST relative to `now` — the real
    // addHistoryEntry() call below captures its own fresh, later
    // Date.now(), which must end up larger than every seeded value for
    // "newest kept" to be unambiguous. (An earlier version of this test
    // seeded timestamps *ahead* of `now`, which could race the real call
    // and land later than it — a bug in the test, not in db.ts.)
    const stmts = Array.from({ length: 205 }, (_, i) =>
      env.DB
        .prepare('INSERT INTO history (user_id, station_id, genre, country, played_at, duration_seconds) VALUES (?, ?, NULL, NULL, ?, 1)')
        .bind(userId, `seed-${i}`, now - 205 + i)
    );
    await env.DB.batch(stmts);

    // One real call through addHistoryEntry() triggers its trim step.
    await addHistoryEntry(env.DB, userId, { stationId: 'the-newest-one', durationSeconds: 1 });

    const history = await listHistory(env.DB, userId);
    expect(history.length).toBeLessThanOrEqual(200);
    expect(history[0].stationId).toBe('the-newest-one'); // newest kept
    expect(history.map((h) => h.stationId)).not.toContain('seed-0'); // oldest trimmed
  });
});

describe('stats: getGlobalStats / recordNewUserStats / recordDailyActivityAndGetStats', () => {
  it('getGlobalStats reflects whatever is in stats_global (explicitly reset here, not assumed)', async () => {
    // Explicit reset rather than assuming a globally-fresh DB — this
    // module's other tests (and other test files) also mutate
    // stats_global, so asserting an absolute baseline must set it up
    // itself to stay correct regardless of test execution order.
    await env.DB.prepare('UPDATE stats_global SET connected_users = 0, active_users = 0, last_updated = 0 WHERE id = 1').run();
    const stats = await getGlobalStats(env.DB);
    expect(stats).toEqual({ connectedUsers: 0, activeUsers: 0, lastUpdated: 0 });
  });

  it('recordNewUserStats increments both connectedUsers and activeUsers by 1', async () => {
    const before = await getGlobalStats(env.DB);
    const after = await recordNewUserStats(env.DB);
    expect(after.connectedUsers).toBe(before.connectedUsers + 1);
    expect(after.activeUsers).toBe(before.activeUsers + 1);
  });

  it('recordDailyActivityAndGetStats increments activeUsers (not connectedUsers) for a returning user not yet active today', async () => {
    const { userId } = await createTestUser();
    // Force last_active_date into the past so "not yet active today" is true.
    await env.DB.prepare('UPDATE users SET last_active_date = ? WHERE id = ?').bind('2000-01-01', userId).run();

    const before = await getGlobalStats(env.DB);
    const after = await recordDailyActivityAndGetStats(env.DB, userId);
    expect(after.activeUsers).toBe(before.activeUsers + 1);
    expect(after.connectedUsers).toBe(before.connectedUsers);
  });

  it('recordDailyActivityAndGetStats is a no-op for a user already active today', async () => {
    const { userId } = await createTestUser(); // last_active_date is already "today"
    const before = await getGlobalStats(env.DB);
    const after = await recordDailyActivityAndGetStats(env.DB, userId);
    expect(after).toEqual(before);
  });

  it('recordDailyActivityAndGetStats updates last_active_date to today', async () => {
    const { userId } = await createTestUser();
    await env.DB.prepare('UPDATE users SET last_active_date = ? WHERE id = ?').bind('2000-01-01', userId).run();
    await recordDailyActivityAndGetStats(env.DB, userId);
    const today = new Date().toISOString().split('T')[0];
    expect((await getUser(env.DB, userId))!.last_active_date).toBe(today);
  });

  it('activeUsers decays after more than an hour of inactivity', async () => {
    // Seed stats_global directly with a lastUpdated far in the past and a
    // known activeUsers count, then apply one more delta and check decay
    // was applied first.
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    await env.DB
      .prepare('UPDATE stats_global SET connected_users = 10, active_users = 100, last_updated = ? WHERE id = 1')
      .bind(twoHoursAgo)
      .run();

    const result = await recordNewUserStats(env.DB); // +1/+1, but decay applies to activeUsers first
    // decayFactor = 0.98^2 ≈ 0.9604 -> floor(100 * 0.9604) = 96, +1 = 97
    expect(result.activeUsers).toBe(97);
    expect(result.connectedUsers).toBe(11);
  });

  it('never lets connectedUsers or activeUsers go negative', async () => {
    await env.DB.prepare('UPDATE stats_global SET connected_users = 0, active_users = 0, last_updated = ? WHERE id = 1')
      .bind(Date.now())
      .run();
    const { userId } = await createTestUser();
    await env.DB.prepare('UPDATE users SET last_active_date = ? WHERE id = ?').bind('2000-01-01', userId).run();
    const result = await recordDailyActivityAndGetStats(env.DB, userId);
    expect(result.activeUsers).toBeGreaterThanOrEqual(0);
    expect(result.connectedUsers).toBeGreaterThanOrEqual(0);
  });
});

describe('Google auth: findUserByProvider / createProviderUser / linkAnonymousUserToProvider', () => {
  it('findUserByProvider returns null for an unknown identity', async () => {
    expect(await findUserByProvider(env.DB, 'google.com', 'no-such-sub')).toBeNull();
  });

  it('createProviderUser creates a fresh, non-anonymous user with the given identity', async () => {
    const sub = crypto.randomUUID();
    const user = await createProviderUser(env.DB, {
      provider: 'google.com',
      providerUserId: sub,
      email: 'ram@example.com',
      displayName: 'Ram Sharan',
    });
    expect(user.is_anonymous).toBe(0);
    expect(user.sign_in_provider).toBe('google.com');
    expect(user.provider_user_id).toBe(sub);
    expect(user.email).toBe('ram@example.com');
    expect(user.display_name).toBe('Ram Sharan');
  });

  it('createProviderUser rejects a duplicate email (partial unique index)', async () => {
    const email = `dup-${crypto.randomUUID()}@example.com`;
    await createProviderUser(env.DB, { provider: 'google.com', providerUserId: crypto.randomUUID(), email, displayName: null });
    await expect(
      createProviderUser(env.DB, { provider: 'google.com', providerUserId: crypto.randomUUID(), email, displayName: null })
    ).rejects.toThrow();
  });

  it('createProviderUser rejects a duplicate (provider, providerUserId) pair', async () => {
    const sub = crypto.randomUUID();
    await createProviderUser(env.DB, { provider: 'google.com', providerUserId: sub, email: null, displayName: null });
    await expect(
      createProviderUser(env.DB, { provider: 'google.com', providerUserId: sub, email: null, displayName: null })
    ).rejects.toThrow();
  });

  it('two different anonymous users can each have a null email — no false collision', async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    expect((await getUser(env.DB, a.userId))!.email).toBeNull();
    expect((await getUser(env.DB, b.userId))!.email).toBeNull();
  });

  it('linkAnonymousUserToProvider converts the SAME row in place — id unchanged', async () => {
    const { userId } = await createTestUser();
    const linked = await linkAnonymousUserToProvider(env.DB, userId, {
      provider: 'google.com',
      providerUserId: 'sub-123',
      email: 'ram@example.com',
      displayName: 'Ram',
    });
    expect(linked.id).toBe(userId); // same row, not a new one
    expect(linked.is_anonymous).toBe(0);
    expect(linked.sign_in_provider).toBe('google.com');
    expect(linked.email).toBe('ram@example.com');
  });

  it('linkAnonymousUserToProvider preserves favorites/history already on that row (the whole point)', async () => {
    const { userId } = await createTestUser();
    await addFavorite(env.DB, userId, 'station-before-link');
    await addHistoryEntry(env.DB, userId, { stationId: 'station-before-link', genre: 'Jazz', durationSeconds: 30 });

    await linkAnonymousUserToProvider(env.DB, userId, {
      provider: 'google.com',
      providerUserId: 'sub-456',
      email: 'link-test@example.com',
      displayName: null,
    });

    const favorites = await listFavorites(env.DB, userId);
    expect(favorites.map((f) => f.stationId)).toContain('station-before-link');
    const history = await listHistory(env.DB, userId);
    expect(history.map((h) => h.stationId)).toContain('station-before-link');
    const user = await getUser(env.DB, userId);
    expect(JSON.parse(user!.genre_stats_json)).toEqual({ Jazz: 1 });
  });

  it('linkAnonymousUserToProvider does not overwrite an already-set displayName', async () => {
    const { userId } = await createTestUser();
    await updateProfile(env.DB, userId, { displayName: 'Existing Name' });
    const linked = await linkAnonymousUserToProvider(env.DB, userId, {
      provider: 'google.com',
      providerUserId: 'sub-789',
      email: 'x@example.com',
      displayName: 'Google Profile Name',
    });
    expect(linked.display_name).toBe('Existing Name');
  });

  it('createProviderUser stores the Google avatarUrl', async () => {
    const user = await createProviderUser(env.DB, {
      provider: 'google.com',
      providerUserId: crypto.randomUUID(),
      email: null,
      displayName: null,
      avatarUrl: 'https://lh3.googleusercontent.com/a/pic123',
    });
    expect(user.avatar_url).toBe('https://lh3.googleusercontent.com/a/pic123');
  });

  it('linkAnonymousUserToProvider stores the Google avatarUrl on the existing row', async () => {
    const { userId } = await createTestUser();
    const linked = await linkAnonymousUserToProvider(env.DB, userId, {
      provider: 'google.com',
      providerUserId: 'sub-avatar-1',
      email: 'avatar@example.com',
      displayName: null,
      avatarUrl: 'https://lh3.googleusercontent.com/a/pic456',
    });
    expect(linked.avatar_url).toBe('https://lh3.googleusercontent.com/a/pic456');
  });
});

describe('findOrCreateProviderUser — the sign-in orchestrator', () => {
  it('creates a brand-new user when there is no anonymous session and no existing match', async () => {
    const sub = crypto.randomUUID();
    const { user, wasLinked, isNewUser } = await findOrCreateProviderUser(
      env.DB,
      { provider: 'google.com', providerUserId: sub, email: 'new@example.com', displayName: 'New User' },
      null
    );
    expect(isNewUser).toBe(true);
    expect(wasLinked).toBe(false);
    expect(user.provider_user_id).toBe(sub);
  });

  it('an existing provider identity always wins over any anonymousUserId', async () => {
    const sub = crypto.randomUUID();
    const existing = await createProviderUser(env.DB, {
      provider: 'google.com',
      providerUserId: sub,
      email: 'existing@example.com',
      displayName: 'Existing',
    });
    const { userId: unrelatedAnonId } = await createTestUser();

    const { user, wasLinked, isNewUser } = await findOrCreateProviderUser(
      env.DB,
      { provider: 'google.com', providerUserId: sub, email: 'existing@example.com', displayName: 'Existing' },
      unrelatedAnonId
    );

    expect(user.id).toBe(existing.id);
    expect(wasLinked).toBe(false);
    expect(isNewUser).toBe(false);

    // The unrelated anonymous account is untouched — not silently merged in.
    const stillAnon = await getUser(env.DB, unrelatedAnonId);
    expect(stillAnon!.is_anonymous).toBe(1);
  });

  it('links (upgrades) the active anonymous account when no existing provider match exists', async () => {
    const { userId } = await createTestUser();
    await addFavorite(env.DB, userId, 'kept-station');

    const sub = crypto.randomUUID();
    const { user, wasLinked, isNewUser } = await findOrCreateProviderUser(
      env.DB,
      { provider: 'google.com', providerUserId: sub, email: 'linked@example.com', displayName: 'Linked' },
      userId
    );

    expect(user.id).toBe(userId); // same account, upgraded in place
    expect(wasLinked).toBe(true);
    expect(isNewUser).toBe(false);
    expect((await listFavorites(env.DB, userId)).map((f) => f.stationId)).toContain('kept-station');
  });

  it('creates a new user (does not link) when the given anonymousUserId is not actually anonymous', async () => {
    // e.g. a stale/already-linked session token was passed as anonymousUserId.
    const alreadyLinked = await createProviderUser(env.DB, {
      provider: 'google.com',
      providerUserId: crypto.randomUUID(),
      email: 'already@example.com',
      displayName: null,
    });

    const sub = crypto.randomUUID();
    const { user, wasLinked, isNewUser } = await findOrCreateProviderUser(
      env.DB,
      { provider: 'google.com', providerUserId: sub, email: 'brandnew@example.com', displayName: null },
      alreadyLinked.id
    );

    expect(wasLinked).toBe(false);
    expect(isNewUser).toBe(true);
    expect(user.id).not.toBe(alreadyLinked.id);
  });

  it('creates a new user when anonymousUserId points at nothing (e.g. deleted account)', async () => {
    const sub = crypto.randomUUID();
    const { isNewUser, wasLinked } = await findOrCreateProviderUser(
      env.DB,
      { provider: 'google.com', providerUserId: sub, email: null, displayName: null },
      'no-such-user-id'
    );
    expect(isNewUser).toBe(true);
    expect(wasLinked).toBe(false);
  });

  it('refreshes avatarUrl on a repeat sign-in for an already-linked identity', async () => {
    const sub = crypto.randomUUID();
    const { user: first } = await findOrCreateProviderUser(
      env.DB,
      { provider: 'google.com', providerUserId: sub, email: 'refresh@example.com', displayName: 'Refresh', avatarUrl: 'https://example.com/old.jpg' },
      null
    );
    expect(first.avatar_url).toBe('https://example.com/old.jpg');

    const { user: second, isNewUser, wasLinked } = await findOrCreateProviderUser(
      env.DB,
      { provider: 'google.com', providerUserId: sub, email: 'refresh@example.com', displayName: 'Refresh', avatarUrl: 'https://example.com/new.jpg' },
      null
    );
    expect(isNewUser).toBe(false);
    expect(wasLinked).toBe(false);
    expect(second.id).toBe(first.id);
    expect(second.avatar_url).toBe('https://example.com/new.jpg');
    expect((await getUser(env.DB, first.id))!.avatar_url).toBe('https://example.com/new.jpg');
  });
});

describe('createSessionForUser', () => {
  it('creates a usable session for an existing user', async () => {
    const user = await createProviderUser(env.DB, {
      provider: 'google.com',
      providerUserId: crypto.randomUUID(),
      email: null,
      displayName: null,
    });
    const tokenHash = crypto.randomUUID();
    await createSessionForUser(env.DB, { userId: user.id, tokenHash, now: Date.now(), expiresAt: Date.now() + 100000 });
    const session = await findSessionByTokenHash(env.DB, tokenHash);
    expect(session).toEqual({ userId: user.id, expiresAt: expect.any(Number) });
  });
});
