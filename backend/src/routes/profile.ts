import { Hono } from 'hono';
import type { Env, Vars } from '../types';
import { requireAuth } from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { getUser, updateProfile, deleteUser, recordDailyActivityAndGetStats, rowToProfile } from '../lib/db';
import { assertOnlyKeys, validateDisplayName, validateCustomId, validatePreferencesPatch } from '../lib/validate';
import { ValidationError, NotFoundError } from '../lib/errors';

const profile = new Hono<{ Bindings: Env; Variables: Vars }>();

profile.use('*', requireAuth());
profile.use('*', rateLimit({ limit: 60, windowSeconds: 60, keyFn: (c) => `uid:${c.get('uid')}` }));

// The account itself is created by POST /api/v1/auth/anonymous — by the
// time a request reaches here, requireAuth() has already proven the
// session maps to a real users row, so this is a plain fetch, not an
// upsert. Also bumps the daily-active-user counter the first time this
// uid is seen on a given UTC day.
profile.get('/', async (c) => {
  const uid = c.get('uid');
  const user = await getUser(c.env.DB, uid);
  if (!user) {
    throw new NotFoundError('Profile not found');
  }
  const globalStats = await recordDailyActivityAndGetStats(c.env.DB, uid);
  return c.json({ profile: rowToProfile(user), globalStats });
});

profile.patch('/', async (c) => {
  const uid = c.get('uid');
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Invalid JSON body');
  });
  assertOnlyKeys(body, ['displayName', 'customId', 'preferences']);

  const patch: { displayName?: string; customId?: string; preferences?: Record<string, unknown> } = {};
  if ('displayName' in body) patch.displayName = validateDisplayName(body.displayName);
  if ('customId' in body) patch.customId = validateCustomId(body.customId);
  if ('preferences' in body) patch.preferences = validatePreferencesPatch(body.preferences);

  await updateProfile(c.env.DB, uid, patch);
  return c.json({ success: true });
});

profile.delete('/', async (c) => {
  await deleteUser(c.env.DB, c.get('uid'));
  return c.json({ success: true });
});

export default profile;
