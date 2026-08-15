import { describe, it, expect } from 'vitest';
import { generateSessionToken, hashToken, SESSION_TTL_MS } from '../../src/lib/session';

describe('generateSessionToken', () => {
  it('produces a non-empty string', () => {
    const token = generateSessionToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('produces base64url output only (no +, /, or = padding)', () => {
    const token = generateSessionToken();
    expect(token).not.toMatch(/[+/=]/);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('encodes exactly 32 bytes (base64url of 32 bytes is 43 chars, unpadded)', () => {
    const token = generateSessionToken();
    expect(token.length).toBe(43);
  });

  it('produces different tokens on repeated calls (randomness sanity check)', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
    expect(tokens.size).toBe(50);
  });
});

describe('hashToken', () => {
  it('produces a 64-character hex string (SHA-256 digest)', async () => {
    const hash = await hashToken('some-token-value');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input always produces the same hash', async () => {
    const a = await hashToken('identical-input');
    const b = await hashToken('identical-input');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await hashToken('input-one');
    const b = await hashToken('input-two');
    expect(a).not.toBe(b);
  });

  it('is sensitive to case (not case-folded)', async () => {
    const a = await hashToken('AbCdEf');
    const b = await hashToken('abcdef');
    expect(a).not.toBe(b);
  });

  it('handles an empty string without throwing', async () => {
    await expect(hashToken('')).resolves.toHaveLength(64);
  });

  it('two independently generated real session tokens hash to different values', async () => {
    const t1 = generateSessionToken();
    const t2 = generateSessionToken();
    const h1 = await hashToken(t1);
    const h2 = await hashToken(t2);
    expect(h1).not.toBe(h2);
  });
});

describe('SESSION_TTL_MS', () => {
  it('is a positive number of milliseconds, roughly 90 days', () => {
    expect(SESSION_TTL_MS).toBeGreaterThan(0);
    expect(SESSION_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
