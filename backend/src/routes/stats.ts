import { Hono } from 'hono';
import type { Env, Vars } from '../types';
import { rateLimit } from '../lib/ratelimit';
import { getGlobalStats } from '../lib/db';

const stats = new Hono<{ Bindings: Env; Variables: Vars }>();

// Public — same "allow read: if true" posture the old firestore.rules had
// for stats/global. Rate-limited by source IP instead of uid since there's
// no auth here.
stats.use('*', rateLimit({ limit: 30, windowSeconds: 60, keyFn: (c) => `ip:${c.req.header('CF-Connecting-IP') ?? 'unknown'}` }));

stats.get('/', async (c) => {
  const globalStats = await getGlobalStats(c.env.DB);
  return c.json(globalStats);
});

export default stats;
