/**
 * Middleware to log all HTTP requests and responses
 */

import { Context, Next } from 'hono';
import { logger } from './logger';

export async function loggingMiddleware(c: Context, next: Next): Promise<void> {
  const startTime = Date.now();
  const method = c.req.method;
  const url = new URL(c.req.url).pathname;
  const userId = c.get('uid'); // Get user ID from context if available

  // Log request
  let requestBody: any = undefined;
  try {
    if (method !== 'GET' && method !== 'HEAD') {
      const clonedRequest = c.req.raw.clone();
      requestBody = await clonedRequest.json().catch(() => null);
    }
  } catch {
    // Body might not be JSON
  }

  logger.logRequest({
    method,
    url,
    headers: {
      contentType: c.req.header('content-type'),
      authorization: c.req.header('authorization') ? '***' : undefined, // Don't log the actual token
    },
    body: requestBody,
    userId,
  });

  // Continue to next middleware/route
  await next();

  // Log response
  const duration = Date.now() - startTime;
  const statusCode = c.res.status;

  logger.logResponse({
    url,
    statusCode,
    duration,
    userId,
  });
}

/**
 * Middleware to log database operations
 */
export function createDatabaseLogger(userId?: string) {
  return {
    logQuery: (query: string, duration: number, rowsAffected?: number) => {
      logger.logDatabase({
        operation: query.split(/\s+/)[0].toUpperCase(), // GET first word (SELECT, INSERT, etc)
        query,
        duration,
        rowsAffected,
        userId,
      });
    },
    logError: (query: string, error: Error, duration: number) => {
      logger.logDatabase({
        operation: query.split(/\s+/)[0].toUpperCase(),
        query,
        duration,
        error: error.message,
        userId,
      });
    },
  };
}

/**
 * Middleware to log errors
 */
export function errorLoggingMiddleware(error: Error, c: Context): void {
  const userId = c.get('uid');
  const url = new URL(c.req.url).pathname;

  logger.logError({
    error,
    context: `Error in ${c.req.method} ${url}`,
    userId,
    url,
    statusCode: c.res.status,
    stack: error.stack,
  });
}
