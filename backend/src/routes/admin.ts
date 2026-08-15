import { Hono } from 'hono';
import type { Env, Vars } from '../types';
import { requireAuth } from '../lib/auth';
import { getUser } from '../lib/db';
import { GOOGLE_PROVIDER } from '../lib/oauth';

const admin = new Hono<{ Bindings: Env; Variables: Vars }>();

const ADMIN_EMAIL = 'ramsharans.rathore@gmail.com';

// GET /admin/data — fetch all database data for admin dashboard
// Only accessible to users authenticated with Google and email ramsharans.rathore@gmail.com
admin.get('/data', requireAuth(), async (c) => {
  const uid = c.get('uid');
  const db = c.env.DB;

  // Get user details to check if they're the admin
  const user = await getUser(db, uid);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Check if user is authenticated via Google (not anonymous)
  if (user.is_anonymous || user.sign_in_provider !== GOOGLE_PROVIDER) {
    return c.json({ error: 'Admin access requires Google sign-in' }, 403);
  }

  // Check if email matches admin email
  if (user.email !== ADMIN_EMAIL) {
    return c.json({ error: 'Unauthorized: insufficient permissions' }, 403);
  }

  try {
    // Fetch all users
    const usersResult = await db
      .prepare(
        `SELECT
          id, custom_id, display_name, email, is_anonymous, sign_in_provider,
          created_at, last_sync_at, total_listening_time,
          preferences_json, genre_stats_json, country_stats_json
        FROM users
        ORDER BY created_at DESC`
      )
      .all();

    // Fetch all sessions
    const sessionsResult = await db
      .prepare(
        `SELECT
          user_id, expires_at, created_at,
          CASE WHEN expires_at > ? THEN 'active' ELSE 'expired' END as status
        FROM sessions
        ORDER BY created_at DESC`
      )
      .bind(Date.now())
      .all();

    // Fetch all favorites with station details
    const favoritesResult = await db
      .prepare(
        `SELECT
          f.user_id, f.station_id, f.position, f.created_at,
          (SELECT display_name FROM users WHERE id = f.user_id) as user_name
        FROM favorites f
        ORDER BY f.user_id, f.position`
      )
      .all();

    // Fetch all history entries
    const historyResult = await db
      .prepare(
        `SELECT
          user_id, station_id, genre, country, played_at, duration_seconds,
          (SELECT display_name FROM users WHERE id = history.user_id) as user_name
        FROM history
        ORDER BY played_at DESC
        LIMIT 1000`
      )
      .all();

    // Fetch global stats
    const statsResult = await db
      .prepare(
        `SELECT
          connected_users, active_users, last_updated
        FROM stats_global`
      )
      .first();

    // Get database statistics
    const totalUsersCount = await db
      .prepare('SELECT COUNT(*) as count FROM users')
      .first();

    const totalFavoritesCount = await db
      .prepare('SELECT COUNT(*) as count FROM favorites')
      .first();

    const totalHistoryCount = await db
      .prepare('SELECT COUNT(*) as count FROM history')
      .first();

    const activeSessionsCount = await db
      .prepare('SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?')
      .bind(Date.now())
      .first();

    const googleUsersCount = await db
      .prepare('SELECT COUNT(*) as count FROM users WHERE sign_in_provider = ?')
      .bind(GOOGLE_PROVIDER)
      .first();

    const anonymousUsersCount = await db
      .prepare('SELECT COUNT(*) as count FROM users WHERE is_anonymous = 1')
      .first();

    return c.json({
      metadata: {
        fetchedAt: new Date().toISOString(),
        adminUser: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
        },
      },
      stats: {
        totalUsers: totalUsersCount?.count || 0,
        googleSignedInUsers: googleUsersCount?.count || 0,
        anonymousUsers: anonymousUsersCount?.count || 0,
        activeSessions: activeSessionsCount?.count || 0,
        totalFavorites: totalFavoritesCount?.count || 0,
        totalHistoryEntries: totalHistoryCount?.count || 0,
        globalStats: statsResult,
      },
      data: {
        users: (usersResult as any)?.results || [],
        sessions: (sessionsResult as any)?.results || [],
        favorites: (favoritesResult as any)?.results || [],
        history: (historyResult as any)?.results || [],
      },
    });
  } catch (error) {
    console.error('Admin data fetch error:', error);
    return c.json({ error: 'Failed to fetch admin data', details: String(error) }, 500);
  }
});

// POST /admin/query — execute read-only SQL queries (admin only)
// Only allows SELECT queries for safety
admin.post('/query', requireAuth(), async (c) => {
  const uid = c.get('uid');
  const db = c.env.DB;

  // Get user details to check if they're the admin
  const user = await getUser(db, uid);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Check if user is authenticated via Google (not anonymous)
  if (user.is_anonymous || user.sign_in_provider !== GOOGLE_PROVIDER) {
    return c.json({ error: 'Admin access requires Google sign-in' }, 403);
  }

  // Check if email matches admin email
  if (user.email !== ADMIN_EMAIL) {
    return c.json({ error: 'Unauthorized: insufficient permissions' }, 403);
  }

  try {
    const body = await c.req.json().catch(() => {
      throw new Error('Invalid JSON body');
    });

    const { query } = body as { query?: string };
    if (!query || typeof query !== 'string') {
      return c.json({ error: 'Missing or invalid query parameter' }, 400);
    }

    // Security: only allow SELECT queries (read-only)
    const trimmedQuery = query.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT')) {
      return c.json({ error: 'Only SELECT queries are allowed' }, 400);
    }

    // Prevent dangerous keywords
    const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'PRAGMA'];
    for (const keyword of dangerousKeywords) {
      if (trimmedQuery.includes(keyword)) {
        return c.json({ error: `Query cannot contain ${keyword}` }, 400);
      }
    }

    // Execute the query
    const result = await db.prepare(query).all();

    return c.json({
      success: true,
      query,
      rowCount: (result as any)?.results?.length || 0,
      data: (result as any)?.results || [],
    });
  } catch (error) {
    console.error('Admin query error:', error);
    return c.json({
      error: 'Query execution failed',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// GET /admin/schema — get database schema info (tables, columns)
admin.get('/schema', requireAuth(), async (c) => {
  const uid = c.get('uid');
  const db = c.env.DB;

  // Get user details to check if they're the admin
  const user = await getUser(db, uid);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Check if user is authenticated via Google (not anonymous)
  if (user.is_anonymous || user.sign_in_provider !== GOOGLE_PROVIDER) {
    return c.json({ error: 'Admin access requires Google sign-in' }, 403);
  }

  // Check if email matches admin email
  if (user.email !== ADMIN_EMAIL) {
    return c.json({ error: 'Unauthorized: insufficient permissions' }, 403);
  }

  try {
    // Get all tables from sqlite_master
    const tablesResult = await db
      .prepare(
        `SELECT name, sql FROM sqlite_master
         WHERE type='table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`
      )
      .all();

    const tables = (tablesResult as any)?.results || [];

    // Get column info for each table
    const schema: Record<string, any> = {};
    for (const table of tables) {
      const columnsResult = await db.prepare(`PRAGMA table_info(${table.name})`).all();
      schema[table.name] = {
        sql: table.sql,
        columns: (columnsResult as any)?.results || [],
      };
    }

    return c.json({
      success: true,
      tables: tables.map((t: any) => t.name),
      schema,
    });
  } catch (error) {
    console.error('Admin schema error:', error);
    return c.json({
      error: 'Failed to fetch schema',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

export default admin;
