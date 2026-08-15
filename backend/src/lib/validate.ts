import { ValidationError } from './errors';

// These limits mirror the constraints already written into firestore.rules
// (see repo root) — porting the same shape/size checks server-side here
// rather than inventing new ones.
export const MAX_DISPLAY_NAME_LEN = 60;
export const MAX_FAVORITES = 500;
export const MAX_HISTORY = 200;
export const MAX_STATION_ID_LEN = 200;
export const MAX_STAT_KEY_LEN = 100;

// Mirrors js/user.js's UserProfile preference defaults object exactly —
// keep these two lists in sync if a new preference is ever added there.
export const ALLOWED_PREFERENCE_KEYS = [
  'theme',
  'language',
  'viewMode',
  'autoRotate',
  'volume',
  'autoResume',
  'visualizerStyle',
  'idleTimeout',
  'visualizerEnabled',
  'visualizerGenres',
  'panelAutoHide',
  'panelAutoHideDelay',
  'httpsOnly',
] as const;

/** Rejects any top-level key not in `allowed` — mirrors firestore.rules' hasOnly(...) pattern. */
export function assertOnlyKeys(obj: unknown, allowed: readonly string[]): void {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (extra.length > 0) {
    throw new ValidationError(`Unknown field(s): ${extra.join(', ')}`);
  }
}

export function validateDisplayName(v: unknown): string {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new ValidationError('displayName must be a non-empty string');
  }
  if (v.length > MAX_DISPLAY_NAME_LEN) {
    throw new ValidationError(`displayName must be at most ${MAX_DISPLAY_NAME_LEN} characters`);
  }
  return v;
}

// Mirrors js/firebase-sync.js's validateCustomId (8-12 chars, lowercase
// alphanumeric + underscore, must start with a letter) verbatim.
export function validateCustomId(v: unknown): string {
  if (typeof v !== 'string') {
    throw new ValidationError('customId must be a string');
  }
  const trimmed = v.trim().toLowerCase();
  if (trimmed.length < 8 || trimmed.length > 12) {
    throw new ValidationError('customId must be 8-12 characters');
  }
  if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
    throw new ValidationError(
      'customId must start with a letter and contain only letters, numbers, and underscore'
    );
  }
  return trimmed;
}

export function validatePreferencesPatch(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new ValidationError('preferences must be an object');
  }
  assertOnlyKeys(v, ALLOWED_PREFERENCE_KEYS);
  return v as Record<string, unknown>;
}

export function validateStationId(v: unknown): string {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new ValidationError('stationId must be a non-empty string');
  }
  if (v.length > MAX_STATION_ID_LEN) {
    throw new ValidationError('stationId is too long');
  }
  return v;
}

export function validateStationIdArray(v: unknown, maxLen: number): string[] {
  if (!Array.isArray(v)) {
    throw new ValidationError('order must be an array');
  }
  if (v.length > maxLen) {
    throw new ValidationError(`order must have at most ${maxLen} entries`);
  }
  return v.map(validateStationId);
}

export interface HistoryEntryInput {
  stationId: string;
  genre?: string;
  country?: string;
  durationSeconds: number;
}

export function validateHistoryEntry(v: unknown): HistoryEntryInput {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  const body = v as Record<string, unknown>;
  const stationId = validateStationId(body.stationId);
  const genre = body.genre === undefined || body.genre === null
    ? undefined
    : String(body.genre).slice(0, MAX_STAT_KEY_LEN);
  const country = body.country === undefined || body.country === null
    ? undefined
    : String(body.country).slice(0, MAX_STAT_KEY_LEN);

  const raw = body.durationSeconds;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    throw new ValidationError('durationSeconds must be a non-negative number');
  }
  // Cap a single reported session at 24h — guards against one malformed or
  // malicious request inflating totalListeningTime arbitrarily.
  const durationSeconds = Math.min(raw, 24 * 60 * 60);

  return { stationId, genre, country, durationSeconds };
}
