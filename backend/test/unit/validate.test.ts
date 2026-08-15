import { describe, it, expect } from 'vitest';
import {
  assertOnlyKeys,
  validateDisplayName,
  validateCustomId,
  validatePreferencesPatch,
  validateStationId,
  validateStationIdArray,
  validateHistoryEntry,
  MAX_DISPLAY_NAME_LEN,
  MAX_STATION_ID_LEN,
  MAX_FAVORITES,
  ALLOWED_PREFERENCE_KEYS,
} from '../../src/lib/validate';
import { ValidationError } from '../../src/lib/errors';

describe('assertOnlyKeys', () => {
  it('passes when the object has only allowed keys', () => {
    expect(() => assertOnlyKeys({ a: 1, b: 2 }, ['a', 'b'])).not.toThrow();
  });

  it('passes on an empty object regardless of the allow-list', () => {
    expect(() => assertOnlyKeys({}, ['a'])).not.toThrow();
  });

  it('passes when the object uses a strict subset of the allow-list', () => {
    expect(() => assertOnlyKeys({ a: 1 }, ['a', 'b', 'c'])).not.toThrow();
  });

  it('throws on an unknown key', () => {
    expect(() => assertOnlyKeys({ a: 1, evil: 2 }, ['a'])).toThrow(ValidationError);
  });

  it('throws and names the offending key(s) in the message', () => {
    try {
      assertOnlyKeys({ a: 1, evil: 2, alsoEvil: 3 }, ['a']);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Error).message).toContain('evil');
      expect((err as Error).message).toContain('alsoEvil');
    }
  });

  it('throws on a non-object (string)', () => {
    expect(() => assertOnlyKeys('not an object', ['a'])).toThrow(ValidationError);
  });

  it('throws on null', () => {
    expect(() => assertOnlyKeys(null, ['a'])).toThrow(ValidationError);
  });

  it('throws on an array, even though typeof array === "object"', () => {
    expect(() => assertOnlyKeys(['a'], ['a'])).toThrow(ValidationError);
  });

  it('throws on undefined', () => {
    expect(() => assertOnlyKeys(undefined, ['a'])).toThrow(ValidationError);
  });
});

describe('validateDisplayName', () => {
  it('accepts a normal name', () => {
    expect(validateDisplayName('Ram Sharan')).toBe('Ram Sharan');
  });

  it('accepts a name exactly at the length boundary', () => {
    const name = 'x'.repeat(MAX_DISPLAY_NAME_LEN);
    expect(validateDisplayName(name)).toBe(name);
  });

  it('rejects a name one character past the boundary', () => {
    const name = 'x'.repeat(MAX_DISPLAY_NAME_LEN + 1);
    expect(() => validateDisplayName(name)).toThrow(ValidationError);
  });

  it('rejects an empty string', () => {
    expect(() => validateDisplayName('')).toThrow(ValidationError);
  });

  it('rejects a whitespace-only string', () => {
    expect(() => validateDisplayName('   ')).toThrow(ValidationError);
  });

  it('rejects non-string input (number)', () => {
    expect(() => validateDisplayName(42)).toThrow(ValidationError);
  });

  it('rejects non-string input (object)', () => {
    expect(() => validateDisplayName({ toString: () => 'hi' })).toThrow(ValidationError);
  });

  it('rejects null and undefined', () => {
    expect(() => validateDisplayName(null)).toThrow(ValidationError);
    expect(() => validateDisplayName(undefined)).toThrow(ValidationError);
  });
});

describe('validateCustomId', () => {
  it('accepts a valid 8-char id', () => {
    expect(validateCustomId('abcdefgh')).toBe('abcdefgh');
  });

  it('accepts a valid 12-char id (upper boundary)', () => {
    const id = 'a'.repeat(12);
    expect(validateCustomId(id)).toBe(id);
  });

  it('accepts underscores and digits after the first letter', () => {
    expect(validateCustomId('a1_2b_3c')).toBe('a1_2b_3c');
  });

  it('lowercases mixed-case input', () => {
    expect(validateCustomId('AbCdEfGh')).toBe('abcdefgh');
  });

  it('trims surrounding whitespace', () => {
    expect(validateCustomId('  abcdefgh  ')).toBe('abcdefgh');
  });

  it('rejects an id one character short of the minimum (7 chars)', () => {
    expect(() => validateCustomId('abcdefg')).toThrow(ValidationError);
  });

  it('rejects an id one character over the maximum (13 chars)', () => {
    expect(() => validateCustomId('a'.repeat(13))).toThrow(ValidationError);
  });

  it('rejects an id starting with a digit', () => {
    expect(() => validateCustomId('1abcdefg')).toThrow(ValidationError);
  });

  it('rejects an id starting with an underscore', () => {
    expect(() => validateCustomId('_abcdefg')).toThrow(ValidationError);
  });

  it('rejects invalid characters (hyphen)', () => {
    expect(() => validateCustomId('abc-defg')).toThrow(ValidationError);
  });

  it('rejects invalid characters (space)', () => {
    expect(() => validateCustomId('abc defg')).toThrow(ValidationError);
  });

  it('rejects non-string input', () => {
    expect(() => validateCustomId(12345678)).toThrow(ValidationError);
  });
});

describe('validatePreferencesPatch', () => {
  it('accepts an empty object', () => {
    expect(validatePreferencesPatch({})).toEqual({});
  });

  it('accepts a single allowed key', () => {
    expect(validatePreferencesPatch({ theme: 'midnight' })).toEqual({ theme: 'midnight' });
  });

  it('accepts every allowed key at once', () => {
    const full = Object.fromEntries(ALLOWED_PREFERENCE_KEYS.map((k) => [k, true]));
    expect(() => validatePreferencesPatch(full)).not.toThrow();
  });

  it('rejects an unknown preference key', () => {
    expect(() => validatePreferencesPatch({ notARealPreference: true })).toThrow(ValidationError);
  });

  it('rejects a mix of valid and invalid keys', () => {
    expect(() => validatePreferencesPatch({ theme: 'dark', evil: true })).toThrow(ValidationError);
  });

  it('rejects a non-object', () => {
    expect(() => validatePreferencesPatch('midnight')).toThrow(ValidationError);
  });

  it('rejects an array', () => {
    expect(() => validatePreferencesPatch(['theme'])).toThrow(ValidationError);
  });

  it('rejects null', () => {
    expect(() => validatePreferencesPatch(null)).toThrow(ValidationError);
  });
});

describe('validateStationId', () => {
  it('accepts a normal id', () => {
    expect(validateStationId('bbc-radio-1')).toBe('bbc-radio-1');
  });

  it('accepts an id exactly at the length boundary', () => {
    const id = 'x'.repeat(MAX_STATION_ID_LEN);
    expect(validateStationId(id)).toBe(id);
  });

  it('rejects an id one character past the boundary', () => {
    expect(() => validateStationId('x'.repeat(MAX_STATION_ID_LEN + 1))).toThrow(ValidationError);
  });

  it('rejects an empty string', () => {
    expect(() => validateStationId('')).toThrow(ValidationError);
  });

  it('rejects a whitespace-only string', () => {
    expect(() => validateStationId('   ')).toThrow(ValidationError);
  });

  it('rejects non-string input', () => {
    expect(() => validateStationId(123)).toThrow(ValidationError);
    expect(() => validateStationId(null)).toThrow(ValidationError);
    expect(() => validateStationId(undefined)).toThrow(ValidationError);
  });
});

describe('validateStationIdArray', () => {
  it('accepts a valid array of ids', () => {
    expect(validateStationIdArray(['a', 'b', 'c'], 500)).toEqual(['a', 'b', 'c']);
  });

  it('accepts an empty array', () => {
    expect(validateStationIdArray([], 500)).toEqual([]);
  });

  it('accepts an array exactly at maxLen', () => {
    const arr = Array.from({ length: 5 }, (_, i) => `s${i}`);
    expect(validateStationIdArray(arr, 5)).toEqual(arr);
  });

  it('rejects an array one element past maxLen', () => {
    const arr = Array.from({ length: 6 }, (_, i) => `s${i}`);
    expect(() => validateStationIdArray(arr, 5)).toThrow(ValidationError);
  });

  it('rejects an array containing an invalid element', () => {
    expect(() => validateStationIdArray(['ok', ''], 500)).toThrow(ValidationError);
  });

  it('rejects a non-array', () => {
    expect(() => validateStationIdArray('not-an-array', 500)).toThrow(ValidationError);
  });

  it('respects the caller-supplied MAX_FAVORITES constant in practice', () => {
    const arr = Array.from({ length: MAX_FAVORITES }, (_, i) => `s${i}`);
    expect(() => validateStationIdArray(arr, MAX_FAVORITES)).not.toThrow();
    expect(() => validateStationIdArray([...arr, 'one-more'], MAX_FAVORITES)).toThrow(ValidationError);
  });
});

describe('validateHistoryEntry', () => {
  it('accepts a fully-populated valid entry', () => {
    const result = validateHistoryEntry({ stationId: 'jazz-fm', genre: 'Jazz', country: 'USA', durationSeconds: 120 });
    expect(result).toEqual({ stationId: 'jazz-fm', genre: 'Jazz', country: 'USA', durationSeconds: 120 });
  });

  it('accepts an entry with genre/country omitted', () => {
    const result = validateHistoryEntry({ stationId: 'jazz-fm', durationSeconds: 0 });
    expect(result.stationId).toBe('jazz-fm');
    expect(result.genre).toBeUndefined();
    expect(result.country).toBeUndefined();
    expect(result.durationSeconds).toBe(0);
  });

  it('accepts an entry with genre/country explicitly null', () => {
    const result = validateHistoryEntry({ stationId: 'x', genre: null, country: null, durationSeconds: 1 });
    expect(result.genre).toBeUndefined();
    expect(result.country).toBeUndefined();
  });

  it('truncates an over-long genre/country to 100 characters', () => {
    const result = validateHistoryEntry({
      stationId: 'x',
      genre: 'g'.repeat(150),
      country: 'c'.repeat(150),
      durationSeconds: 1,
    });
    expect(result.genre).toHaveLength(100);
    expect(result.country).toHaveLength(100);
  });

  it('coerces a non-string genre/country to a string before truncating', () => {
    const result = validateHistoryEntry({ stationId: 'x', genre: 12345, durationSeconds: 1 });
    expect(result.genre).toBe('12345');
  });

  it('rejects a missing stationId', () => {
    expect(() => validateHistoryEntry({ durationSeconds: 1 })).toThrow(ValidationError);
  });

  it('rejects a negative durationSeconds', () => {
    expect(() => validateHistoryEntry({ stationId: 'x', durationSeconds: -1 })).toThrow(ValidationError);
  });

  it('rejects a non-number durationSeconds', () => {
    expect(() => validateHistoryEntry({ stationId: 'x', durationSeconds: '120' })).toThrow(ValidationError);
  });

  it('rejects NaN/Infinity durationSeconds', () => {
    expect(() => validateHistoryEntry({ stationId: 'x', durationSeconds: NaN })).toThrow(ValidationError);
    expect(() => validateHistoryEntry({ stationId: 'x', durationSeconds: Infinity })).toThrow(ValidationError);
  });

  it('caps an absurdly large durationSeconds at 24 hours rather than rejecting it', () => {
    const result = validateHistoryEntry({ stationId: 'x', durationSeconds: 999999999 });
    expect(result.durationSeconds).toBe(24 * 60 * 60);
  });

  it('accepts durationSeconds of exactly 0', () => {
    const result = validateHistoryEntry({ stationId: 'x', durationSeconds: 0 });
    expect(result.durationSeconds).toBe(0);
  });

  it('rejects a non-object body', () => {
    expect(() => validateHistoryEntry('not an object')).toThrow(ValidationError);
    expect(() => validateHistoryEntry(null)).toThrow(ValidationError);
    expect(() => validateHistoryEntry(['x'])).toThrow(ValidationError);
  });
});
