/** Cloudflare bindings + non-secret vars declared in wrangler.toml. */
export interface Env {
  DB: D1Database;
  // Dual-purpose: rate-limit counters (see lib/ratelimit.ts, key prefix
  // "rl:") AND short-lived OAuth state/PKCE storage (see lib/oauth.ts /
  // routes/auth.ts, key prefix "oauth:") — one KV namespace for both
  // rather than provisioning a second real Cloudflare resource for what's
  // conceptually the same "small, ephemeral, keyed blob" need.
  RATE_LIMIT_KV: KVNamespace;
  ALLOWED_ORIGINS: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_REDIRECT_URI: string;
  /** Secret — via .dev.vars locally, `wrangler secret put` only at deploy time. */
  GOOGLE_CLIENT_SECRET: string;
  FRONTEND_ORIGIN: string;
}

/** Hono per-request context variables, set by lib/auth.ts's requireAuth(). */
export interface Vars {
  uid: string;
  tokenHash: string;
}
