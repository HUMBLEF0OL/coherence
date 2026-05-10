/**
 * v0.3 M3 — DD-107 developer identity hash.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashEmail,
  getIdentity,
  setIdentityOverride,
} from '../../../src/state/identity.js';

describe('hashEmail (DD-107)', () => {
  it('returns a deterministic 12-hex hash', () => {
    const a = hashEmail('alice@example.com');
    const b = hashEmail('alice@example.com');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  it('treats email casing + whitespace as canonical', () => {
    const a = hashEmail('Alice@Example.com');
    const b = hashEmail('  alice@example.com  ');
    expect(a).toBe(b);
  });

  it('different emails hash differently', () => {
    expect(hashEmail('a@x.com')).not.toBe(hashEmail('b@x.com'));
  });
});

describe('getIdentity', () => {
  beforeEach(() => {
    setIdentityOverride(null);
  });

  it('honours setIdentityOverride for tests', () => {
    setIdentityOverride({ hash: 'aaaaaaaaaaaa', display: 'Alice' });
    const id = getIdentity();
    expect(id).toEqual({ hash: 'aaaaaaaaaaaa', display: 'Alice' });
  });

  it('display name is intended for CLI surface only — never persisted to plan files (verified by static-analysis gate M6)', () => {
    setIdentityOverride({ hash: 'aaaaaaaaaaaa', display: 'Display Name' });
    const id = getIdentity();
    // Plan writer uses .hash, not .display.
    expect(id.hash).toMatch(/^[0-9a-f]{12}$/);
    expect(typeof id.display).toBe('string');
  });
});
