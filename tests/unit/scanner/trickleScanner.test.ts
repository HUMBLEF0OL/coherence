/**
 * Trickle scanner (DD-066, FR-TRICKLE).
 */
import { describe, it, expect } from 'vitest';
import {
  scanTrickle,
  TRICKLE_BUDGET_MS,
  type ScanCacheState,
} from '../../../src/scanner/trickleScanner.js';

const baseState = (over: Partial<ScanCacheState> = {}): ScanCacheState => ({
  schema_version: 2,
  last_pass_at: '',
  entries_this_session: 0,
  per_session_cap: 20,
  idle_threshold_ms: 30_000,
  ...over,
});

describe('scanTrickle', () => {
  it('short-circuits when host is not idle', () => {
    const r = scanTrickle(baseState(), {
      candidatePaths: ['a', 'b'],
      idleMs: 1000,
      cumulativeMs: 0,
    });
    expect(r.scanned).toEqual([]);
    expect(r.reason).toBe('not_idle');
  });

  it('short-circuits when per-session cap is reached', () => {
    const r = scanTrickle(baseState({ entries_this_session: 20 }), {
      candidatePaths: ['a'],
      idleMs: 60_000,
      cumulativeMs: 0,
    });
    expect(r.reason).toBe('cap_reached');
  });

  it('respects the cumulative budget (≤ 100 ms)', () => {
    const r = scanTrickle(baseState(), {
      candidatePaths: ['a'],
      idleMs: 60_000,
      cumulativeMs: TRICKLE_BUDGET_MS,
    });
    expect(r.reason).toBe('budget_exhausted');
  });

  it('walks paths in lex order, bounded by remaining budget', () => {
    const paths = ['z.md', 'a.md', 'm.md'];
    const r = scanTrickle(baseState({ per_session_cap: 5 }), {
      candidatePaths: paths,
      idleMs: 60_000,
      cumulativeMs: 0,
    });
    expect(r.scanned).toEqual(['a.md', 'm.md', 'z.md']);
  });

  it('budget bounds the number scanned', () => {
    const paths = Array.from({ length: 50 }, (_, i) =>
      `doc-${String(i).padStart(2, '0')}.md`,
    );
    const r = scanTrickle(baseState({ per_session_cap: 100 }), {
      candidatePaths: paths,
      idleMs: 60_000,
      // 50 ms used → only 50 ms remain → at 5ms/doc → 10 docs.
      cumulativeMs: 50,
    });
    expect(r.scanned).toHaveLength(10);
  });

  it('cap bounds the number scanned', () => {
    const paths = Array.from({ length: 50 }, (_, i) => `${i}.md`);
    const r = scanTrickle(baseState({ entries_this_session: 18, per_session_cap: 20 }), {
      candidatePaths: paths,
      idleMs: 60_000,
      cumulativeMs: 0,
    });
    expect(r.scanned).toHaveLength(2);
  });

  it('updates state.entries_this_session and last_pass_at', () => {
    const r = scanTrickle(baseState(), {
      candidatePaths: ['a.md', 'b.md'],
      idleMs: 60_000,
      cumulativeMs: 0,
    });
    expect(r.state.entries_this_session).toBe(2);
    expect(r.state.last_pass_at).not.toBe('');
  });
});
