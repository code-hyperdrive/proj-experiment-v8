import { describe, it, expect } from 'vitest';
import { ValidationError, NotFoundError, ConflictError, LimitExceededError } from '../../src/lib/errors';

// Trivial in isolation, but index.ts's app.onError() dispatches on
// `instanceof` checks against these exact classes — a mistake here
// (e.g. not extending Error, or a typo breaking the prototype chain)
// would silently turn every mapped error into a generic 500. Worth
// pinning down explicitly.

describe('custom error classes', () => {
  const cases: [string, new (message?: string) => Error][] = [
    ['ValidationError', ValidationError],
    ['NotFoundError', NotFoundError],
    ['ConflictError', ConflictError],
    ['LimitExceededError', LimitExceededError],
  ];

  for (const [name, ErrorClass] of cases) {
    describe(name, () => {
      it('is an instance of Error', () => {
        expect(new ErrorClass('x')).toBeInstanceOf(Error);
      });

      it(`is an instance of ${name} specifically`, () => {
        expect(new ErrorClass('x')).toBeInstanceOf(ErrorClass);
      });

      it('carries the message through', () => {
        expect(new ErrorClass('something went wrong').message).toBe('something went wrong');
      });

      it('is distinguishable from the other custom error classes', () => {
        const instance = new ErrorClass('x');
        for (const [otherName, OtherClass] of cases) {
          if (otherName === name) continue;
          expect(instance).not.toBeInstanceOf(OtherClass);
        }
      });
    });
  }
});
