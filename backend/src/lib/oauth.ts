import { generateSessionToken, toBase64Url } from './session';
import type { Env } from '../types';

export const GOOGLE_PROVIDER = 'google.com';

/**
 * PKCE pair for the Authorization Code flow. `codeVerifier` is stashed
 * server-side (in KV, keyed by `state` — see routes/auth.ts) rather than
 * sent to the browser at all; only `codeChallenge` goes into the redirect
 * URL. generateSessionToken() is reused here purely because it already
 * produces a random, appropriately-long base64url string — nothing about
 * it is session-specific.
 */
export async function generatePkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = generateSessionToken();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = toBase64Url(new Uint8Array(digest));
  return { codeVerifier, codeChallenge };
}

export interface GoogleIdTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  [key: string]: unknown;
}

/**
 * Decodes (does NOT verify the signature of) a JWT's payload segment.
 * Safe here specifically because this id_token comes directly from
 * Google's token endpoint via a server-to-server HTTPS call authenticated
 * with our client secret (see exchangeGoogleCode below) — there's no
 * untrusted caller in a position to forge it. Contrast with
 * lib/auth.ts's old Firebase-JWT verification, which *did* need
 * signature checks because that token arrived from an arbitrary client.
 */
export function decodeJwtPayload(jwt: string): GoogleIdTokenPayload {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT: expected 3 dot-separated segments');
  }
  let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  return JSON.parse(atob(base64));
}

export interface GoogleTokenResponse {
  id_token: string;
  access_token: string;
}

// Test-only seam — lets tests substitute a fake token exchange instead of
// making a real network call to Google, the same way lib/auth.ts's old
// __setJwksForTesting() let tests substitute a local JWKS. Never set
// outside test code.
let exchangeOverrideForTesting:
  | ((env: Env, code: string, codeVerifier: string) => Promise<GoogleTokenResponse>)
  | undefined;

export function __setGoogleTokenExchangeForTesting(
  fn: typeof exchangeOverrideForTesting
): void {
  exchangeOverrideForTesting = fn;
}

/** Exchanges an authorization code for tokens via Google's token endpoint. */
export async function exchangeGoogleCode(
  env: Env,
  code: string,
  codeVerifier: string
): Promise<GoogleTokenResponse> {
  if (exchangeOverrideForTesting) {
    return exchangeOverrideForTesting(env, code, codeVerifier);
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: env.GOOGLE_REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google token exchange failed (${res.status}): ${body}`);
  }

  return res.json();
}
