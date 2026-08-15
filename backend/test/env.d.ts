import type { Env } from '../src/types';

// Declaration merging so `env` imported from 'cloudflare:test' is typed as
// our real Env (D1Database, KVNamespace, ALLOWED_ORIGINS) instead of an
// empty placeholder. Standard pattern from @cloudflare/vitest-pool-workers'
// own docs.
declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
