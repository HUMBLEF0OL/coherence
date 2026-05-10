/**
 * Trickle deep-scan budget regression gate (M9 deliverable).
 *
 * FR-TRICKLE-3 / DD-066: cumulative trickle scanner CPU per PostToolUse
 * window must stay strictly below `TRICKLE_BUDGET_MS` (100 ms). This test
 * exercises the pure scanner with a large candidate set across multiple
 * back-to-back invocations and asserts that:
 *
 *   1. No single call attributes more than the remaining budget.
 *   2. After cumulative spend reaches the budget, subsequent calls
 *      short-circuit with `budget_exhausted` and 0 ms used.
 *   3. Per-session cap is honoured independently of the budget gate.
 */
import { describe, it, expect } from 'vitest';
import {
    scanTrickle,
    TRICKLE_BUDGET_MS,
    DEFAULT_PER_SESSION_CAP,
    DEFAULT_IDLE_THRESHOLD_MS,
} from '../../src/scanner/trickleScanner.js';
import type { ScanCacheState } from '../../src/scanner/trickleScanner.js';

function freshState(): ScanCacheState {
    return {
        schema_version: 2,
        last_pass_at: '1970-01-01T00:00:00.000Z',
        entries_this_session: 0,
        per_session_cap: DEFAULT_PER_SESSION_CAP,
        idle_threshold_ms: DEFAULT_IDLE_THRESHOLD_MS,
    };
}

describe('trickle budget (FR-TRICKLE-3, DD-066)', () => {
    it('PG-T1: single invocation never exceeds TRICKLE_BUDGET_MS', () => {
        const state = freshState();
        const candidates = Array.from({ length: 200 }, (_, i) => `docs/d${i}.md`);
        const r = scanTrickle(state, {
            candidatePaths: candidates,
            idleMs: DEFAULT_IDLE_THRESHOLD_MS + 1,
            cumulativeMs: 0,
        });
        expect(r.ms_used).toBeLessThanOrEqual(TRICKLE_BUDGET_MS);
    });

    it('PG-T2: cumulative spend across N calls stays under TRICKLE_BUDGET_MS', () => {
        let state = freshState();
        let cumulative = 0;
        const calls: number[] = [];
        for (let pass = 0; pass < 10; pass++) {
            const r = scanTrickle(state, {
                candidatePaths: Array.from({ length: 30 }, (_, i) => `docs/p${pass}-${i}.md`),
                idleMs: DEFAULT_IDLE_THRESHOLD_MS + 1,
                cumulativeMs: cumulative,
            });
            cumulative += r.ms_used;
            calls.push(r.ms_used);
            state = r.state;
        }
        expect(cumulative).toBeLessThanOrEqual(TRICKLE_BUDGET_MS);
    });

    it('PG-T3: once cumulative reaches budget, subsequent calls short-circuit', () => {
        const state = freshState();
        const r = scanTrickle(state, {
            candidatePaths: ['x.md'],
            idleMs: DEFAULT_IDLE_THRESHOLD_MS + 1,
            cumulativeMs: TRICKLE_BUDGET_MS,
        });
        expect(r.scanned).toHaveLength(0);
        expect(r.ms_used).toBe(0);
        expect(r.reason).toBe('budget_exhausted');
    });

    it('PG-T4: per-session cap caps scan count even when budget remains', () => {
        const state: ScanCacheState = { ...freshState(), entries_this_session: DEFAULT_PER_SESSION_CAP };
        const r = scanTrickle(state, {
            candidatePaths: Array.from({ length: 5 }, (_, i) => `f${i}.md`),
            idleMs: DEFAULT_IDLE_THRESHOLD_MS + 1,
            cumulativeMs: 0,
        });
        expect(r.scanned).toHaveLength(0);
        expect(r.reason).toBe('cap_reached');
    });
});
