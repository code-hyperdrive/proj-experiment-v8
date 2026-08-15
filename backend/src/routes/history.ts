import { Hono } from 'hono';
import type { Env, Vars } from '../types';
import { requireAuth } from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { addHistoryEntry, listHistory } from '../lib/db';
import { assertOnlyKeys, validateHistoryEntry } from '../lib/validate';
import { ValidationError } from '../lib/errors';

const history = new Hono<{ Bindings: Env; Variables: Vars }>();

history.use('*', requireAuth());
history.use('*', rateLimit({ limit: 60, windowSeconds: 60, keyFn: (c) => `uid:${c.get('uid')}` }));

history.get('/', async (c) => {
  const list = await listHistory(c.env.DB, c.get('uid'));
  return c.json({ history: list });
});

history.post('/', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Invalid JSON body');
  });
  assertOnlyKeys(body, ['stationId', 'genre', 'country', 'durationSeconds']);
  const entry = validateHistoryEntry(body);
  await addHistoryEntry(c.env.DB, c.get('uid'), entry);
  return c.json({ success: true });
});

export default history;
