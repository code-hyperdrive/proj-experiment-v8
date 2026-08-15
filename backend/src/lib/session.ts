// Opaque bearer-session tokens — no JWT, no signing key. A session is
// "valid" purely because its hash exists as an unexpired row in D1;
// there's nothing to cryptographically verify, so there's no secret key
// for this backend to hold at all.

// Sliding-window session lifetime: every successful authenticated request
// pushes expiry this far into the future again (see lib/auth.ts), so an
// actively-used session effectively never expires, while an abandoned one
// ages out on its own.
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// Exported so lib/oauth.ts can reuse it for PKCE's code_challenge — same
// base64url encoding, different input.
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 32 cryptographically random bytes, base64url-encoded — this is the raw token handed to the client exactly once. */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** SHA-256 of the raw token (Web Crypto, native to the Workers runtime) — this, not the raw token, is what's stored in D1. */
export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}
