// Custom error types thrown by lib/validate.ts and lib/db.ts, mapped to
// HTTP status codes in a single place: index.ts's app.onError() handler.

/** Malformed/out-of-bounds request input. Maps to 400. */
export class ValidationError extends Error {}

/** Referenced resource (e.g. a profile) doesn't exist yet. Maps to 404. */
export class NotFoundError extends Error {}

/** Write would violate a uniqueness/ownership constraint. Maps to 409. */
export class ConflictError extends Error {}

/** Write would exceed a hard per-user cap (favorites/history size). Maps to 409. */
export class LimitExceededError extends Error {}
