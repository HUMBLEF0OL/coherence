/**
 * v1.0 M0 — DD-138 trust-score formula correctness (M-LEDGER-3).
 */
import { describe, it, expect } from 'vitest';
import { computeSectionScore, type TrustEvent } from '../../../src/state/trustLedger.js';

const NOW = Date.parse('2026-06-01T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function ev(ageDays: number, kind: 'accept' | 'edit' | 'revert'): TrustEvent {
  const _ts = new Date(NOW - ageDays * DAY_MS).toISOString();
  const weight = kind === 'accept' ? 1 : kind === 'revert' ? -1 : 0;
  return { _ts, weight, kind };
}

describe('computeSectionScore (DD-138)', () => {
  it('1 accept at age 0 → score = 1.0', () => {
    const s = computeSectionScore([ev(0, 'accept')], NOW);
    expect(s).toBeCloseTo(1.0, 5);
  });

  it('1 accept + 1 revert at age 0 → score = 0.0', () => {
    const s = computeSectionScore([ev(0, 'accept'), ev(0, 'revert')], NOW);
    expect(s).toBeCloseTo(0.0, 5);
  });

  it('2 accepts + 1 edit at age 0 → score = 0.8 (2.0 / 2.5)', () => {
    const s = computeSectionScore(
      [ev(0, 'accept'), ev(0, 'accept'), ev(0, 'edit')],
      NOW,
    );
    expect(s).toBeCloseTo(0.8, 5);
  });

  it('1 accept aged 30 days → score = 1.0 (decay cancels in num/denom)', () => {
    const s = computeSectionScore([ev(30, 'accept')], NOW);
    expect(s).toBeCloseTo(1.0, 5);
  });

  it('empty events → score = 0', () => {
    expect(computeSectionScore([], NOW)).toBe(0);
  });

  it('all events at very large age (decay near zero) → score = 0 via denominator guard', () => {
    const veryOld = ev(5 * 365, 'accept');
    const s = computeSectionScore([veryOld], NOW);
    // ALPHA^(5*365) ≈ exp(-5*365*0.0233) ≈ 0 — guarded by DENOM_EPSILON
    expect(s).toBe(0);
  });

  it('1 revert (age 0) → score = -1', () => {
    expect(computeSectionScore([ev(0, 'revert')], NOW)).toBeCloseTo(-1, 5);
  });

  it('1 edit only → numerator 0, denominator 0.5 → score = 0', () => {
    expect(computeSectionScore([ev(0, 'edit')], NOW)).toBe(0);
  });

  it('future timestamps clamped to ageDays = 0 (no inflation)', () => {
    const future = { _ts: new Date(NOW + 365 * DAY_MS).toISOString(), weight: 1 as const, kind: 'accept' as const };
    const s = computeSectionScore([future], NOW);
    expect(s).toBeCloseTo(1.0, 5);
  });
});
