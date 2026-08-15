import { Hono } from 'hono';
import type { Env, Vars } from './types';
import { corsMiddleware } from './lib/cors';
import { ValidationError, NotFoundError, ConflictError, LimitExceededError } from './lib/errors';
import { loggingMiddleware } from './lib/logging-middleware';
import { logger } from './lib/logger';
import auth from './routes/auth';
import profile from './routes/profile';
import favorites from './routes/favorites';
import history from './routes/history';
import stats from './routes/stats';
import admin from './routes/admin';
import stationStatus from './routes/station-status';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use('*', corsMiddleware());
app.use('*', loggingMiddleware);

app.get('/', (c) => c.json({ name: 'radio-explorer-api', status: 'ok' }));
app.get('/api/v1/health', (c) => c.json({ status: 'ok', time: Date.now() }));

app.route('/api/v1/auth', auth);
app.route('/api/v1/profile', profile);
app.route('/api/v1/favorites', favorites);
app.route('/api/v1/history', history);
app.route('/api/v1/stats', stats);
app.route('/api/v1/admin', admin);
app.route('/api/v1/stations/status', stationStatus);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  const userId = c.get('uid');
  const url = new URL(c.req.url).pathname;

  if (err instanceof ValidationError) {
    logger.logError({
      error: err,
      context: `Validation error in ${c.req.method} ${url}`,
      userId,
      url,
      statusCode: 400,
    });
    return c.json({ error: err.message }, 400);
  }
  if (err instanceof NotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof ConflictError) {
    logger.logError({
      error: err,
      context: `Conflict error in ${c.req.method} ${url}`,
      userId,
      url,
      statusCode: 409,
    });
    return c.json({ error: err.message }, 409);
  }
  if (err instanceof LimitExceededError) {
    logger.logError({
      error: err,
      context: `Rate limit exceeded in ${c.req.method} ${url}`,
      userId,
      url,
      statusCode: 409,
    });
    return c.json({ error: err.message }, 409);
  }

  logger.logError({
    error: err,
    context: `Unhandled error in ${c.req.method} ${url}`,
    userId,
    url,
    statusCode: 500,
  });

  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
