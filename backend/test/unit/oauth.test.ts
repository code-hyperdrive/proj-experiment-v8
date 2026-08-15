import { describe, it, expect, afterEach } from 'vitest';
import {
  generatePkcePair,
  decodeJwtPayload,
  exchangeGoogleCode,
  __setGoogleTokenExchangeForTesting,
} from '../../src/lib/oauth';
import { env } from 'cloudflare:test';

describe('generatePkcePair', () => {
  it('produces a codeVerifier and a codeChallenge', async () => {
    const { codeVerifier, codeChallenge } = await generatePkcePair();
    expect(typeof codeVerifier).toBe('string');
    expect(typeof codeChallenge).toBe('string');
    expect(codeVerifier.length).toBeGreaterThan(0);
    expect(codeChallenge.length).toBeGreaterThan(0);
  });

  it('codeVerifier length satisfies PKCE\'s 43-128 character requirement', async () => {
    const { codeVerifier } = await generatePkcePair();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier.length).toBeLessThanOrEqual(128);
  });

  it('both values are base64url (no +, /, or = padding)', async () => {
    const { codeVerifier, codeChallenge } = await generatePkcePair();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('codeChallenge is the SHA-256 of codeVerifier (deterministic given the same verifier)', async () => {
    const { codeVerifier, codeChallenge } = await generatePkcePair();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(codeChallenge).toBe(expected);
  });

  it('produces different pairs on repeated calls', async () => {
    const a = await generatePkcePair();
    const b = await generatePkcePair();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });
});

function makeFakeJwt(payload: Record<string, unknown>): string {
  const toBase64Url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${toBase64Url({ alg: 'RS256', typ: 'JWT' })}.${toBase64Url(payload)}.fake-signature-not-checked`;
}

describe('decodeJwtPayload', () => {
  it('decodes a well-formed JWT payload', () => {
    const jwt = makeFakeJwt({ sub: '12345', email: 'ram@example.com', name: 'Ram' });
    expect(decodeJwtPayload(jwt)).toEqual({ sub: '12345', email: 'ram@example.com', name: 'Ram' });
  });

  it('handles a payload requiring base64 padding correctly', () => {
    // Deliberately pick a payload whose JSON length produces unpadded
    // base64url output, to exercise the manual '=' padding restoration.
    const jwt = makeFakeJwt({ sub: 'x' });
    expect(decodeJwtPayload(jwt).sub).toBe('x');
  });

  it('throws on a malformed token (wrong number of segments)', () => {
    expect(() => decodeJwtPayload('only.two')).toThrow(/Malformed JWT/);
    expect(() => decodeJwtPayload('nodotsatall')).toThrow(/Malformed JWT/);
  });
});

describe('exchangeGoogleCode', () => {
  afterEach(() => {
    __setGoogleTokenExchangeForTesting(undefined);
  });

  it('uses the test override when one is set, never touching the network', async () => {
    __setGoogleTokenExchangeForTesting(async (_env, code, codeVerifier) => {
      expect(code).toBe('test-code');
      expect(codeVerifier).toBe('test-verifier');
      return { id_token: 'fake.id.token', access_token: 'fake-access-token' };
    });

    const result = await exchangeGoogleCode(env, 'test-code', 'test-verifier');
    expect(result).toEqual({ id_token: 'fake.id.token', access_token: 'fake-access-token' });
  });

  it('with no override, calls the real Google token endpoint with the expected request shape', async () => {
    // Stubs global fetch rather than hitting the real network — this
    // repo's standing rule (see plan doc / test-local.sh) is that nothing
    // in the automated suite touches a real external service.
    __setGoogleTokenExchangeForTesting(async () => ({ id_token: 'x', access_token: 'y' }));
    __setGoogleTokenExchangeForTesting(undefined); // confirm clearing it actually falls through below

    const calls: { url: string; init: RequestInit }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ id_token: 'stubbed.id.token', access_token: 'stubbed-access' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    let result;
    try {
      result = await exchangeGoogleCode(env, 'test-code', 'test-verifier');
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(result).toEqual({ id_token: 'stubbed.id.token', access_token: 'stubbed-access' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(calls[0].init.method).toBe('POST');
    const bodyString = String(calls[0].init.body);
    expect(bodyString).toContain('code=test-code');
    expect(bodyString).toContain('code_verifier=test-verifier');
    expect(bodyString).toContain('grant_type=authorization_code');
  });

  it('throws a descriptive error when Google returns a non-OK response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response('invalid_grant', { status: 400 })) as typeof fetch;

    try {
      await expect(exchangeGoogleCode(env, 'bad-code', 'test-verifier')).rejects.toThrow(/400/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
