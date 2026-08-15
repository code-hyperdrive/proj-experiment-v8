import { Hono } from 'hono';
import type { Env, Vars } from '../types';
import { requireAuth } from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { listFavorites, addFavorite, removeFavorite, reorderFavorites } from '../lib/db';
import { assertOnlyKeys, validateStationId, validateStationIdArray, MAX_FAVORITES } from '../lib/validate';
import { ValidationError } from '../lib/errors';

const favorites = new Hono<{ Bindings: Env; Variables: Vars }>();

favorites.use('*', requireAuth());
favorites.use('*', rateLimit({ limit: 60, windowSeconds: 60, keyFn: (c) => `uid:${c.get('uid')}` }));

favorites.get('/', async (c) => {
  const list = await listFavorites(c.env.DB, c.get('uid'));
  return c.json({ favorites: list });
});

// Registered before '/:stationId' so it isn't shadowed by the param route.
favorites.put('/reorder', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Invalid JSON body');
  });
  assertOnlyKeys(body, ['order']);
  const order = validateStationIdArray(body.order, MAX_FAVORITES);
  await reorderFavorites(c.env.DB, c.get('uid'), order);
  return c.json({ success: true });
});

favorites.put('/:stationId', async (c) => {
  const stationId = validateStationId(c.req.param('stationId'));
  const result = await addFavorite(c.env.DB, c.get('uid'), stationId);
  return c.json(result);
});

favorites.delete('/:stationId', async (c) => {
  const stationId = validateStationId(c.req.param('stationId'));
  await removeFavorite(c.env.DB, c.get('uid'), stationId);
  return c.json({ success: true });
});

export default favorites;
