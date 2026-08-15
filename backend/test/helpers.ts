/**
 * Creates a real anonymous account + session by calling the actual
 * POST /api/v1/auth/anonymous route (via `SELF.fetch` from
 * 'cloudflare:test') — no faked tokens, no mocked identity provider.
 * Because auth is now backend-owned (D1-verified opaque sessions, not a
 * Firebase-issued JWT), this works fully offline with zero external
 * dependency, unlike the Firebase-Auth-based design this replaced.
 */
export async function createAnonymousSession(
  fetcher: { fetch: typeof fetch }
): Promise<{ userId: string; sessionToken: string; expiresAt: number }> {
  const res = await fetcher.fetch('http://backend.test/api/v1/auth/anonymous', { method: 'POST' });
  return res.json();
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
