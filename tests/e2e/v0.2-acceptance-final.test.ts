/**
 * v0.2.0 GA acceptance checklist — runs every BRD-4 §7.1 acceptance row
 * from a single fixture session. Used by `scripts/release-ga.mjs` as the
 * gate that refuses to tag if any row is red.
 *
 * Coverage:
 *   - FG-1 v1→v2 migration on synthetic v1 fixture
 *   - FG-2 graduate v0.2 sets per-scope mode
 *   - FG-5 bash signal fires on 3 normalised matches
 *   - FG-8/9/10 propose lifecycle FSM, collision, revert
 *   - FG-13/14 statusline install + OSC degradation
 *   - SG-3 boundary
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore } from '../../src/state/init.js';
import { runGraduate } from '../../src/commands/graduate.js';
import { detectBashRepetition } from '../../src/signal/bashRepetition.js';
import { defaultSignalCache } from '../../src/signal/signalCache.js';
import { ProposalStore } from '../../src/proposals/store.js';
import { runProposeAccept } from '../../src/commands/proposeAccept.js';
import { runProposeRevertAcceptance } from '../../src/commands/proposeRevertAcceptance.js';
import { renderClickAffordance } from '../../src/observability/statusline.js';
import { wilson95, meetsCalibrationFloor } from '../../src/util/wilson.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-ga-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('v0.2.0 GA acceptance checklist (BRD-4 §7.1)', () => {
  // FG-1 v1→v2 migration retired in v0.3 (DD-118: each major version stands
  // alone). Pre-v3 state is refused at SessionStart by refuseLegacy(); see
  // tests/unit/state/refuse-legacy.test.ts.

  it('FG-2: graduate annotate sets per-scope mode', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const r = await runGraduate(store, { mode: 'annotate', scope: 'docs/' });
    expect(r.v02NewMode).toBe('annotate');
  });

  it('FG-5: bash signal fires on 3 normalised matches in 30 min', () => {
    let cache = defaultSignalCache();
    cache = detectBashRepetition(cache, 'ls -la', new Date('2026-05-10T10:00:00Z')).cache;
    cache = detectBashRepetition(cache, 'ls -la', new Date('2026-05-10T10:01:00Z')).cache;
    const r = detectBashRepetition(cache, 'ls -la', new Date('2026-05-10T10:02:00Z'));
    expect(r.fired).toBe(true);
  });

  it('FG-8/9/10: propose-accept + propose-revert-acceptance round-trip', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const pstore = new ProposalStore(store);
    ProposalStore.resetSessionCount('s');
    const enq = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h-ga',
      artifact: { filename: 'SKILL.md', content: '# GA test' },
      sessionId: 's',
    });
    const a = await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: enq.manifest.proposal_id,
    });
    expect(a.accepted).toBe(true);
    const rv = await runProposeRevertAcceptance({
      store,
      projectRoot: dir,
      proposalId: enq.manifest.proposal_id,
      acceptedPath: a.written_path!,
    });
    expect(rv.reverted).toBe(true);
  });

  it('FG-14: statusline OSC8 degradation tier matches host capability', () => {
    expect(renderClickAffordance('[x]', '/c:y', { terminal_hyperlink: 'osc8' }, {}).tier).toBe(
      'osc8',
    );
    expect(renderClickAffordance('[x]', '/c:y', { terminal_hyperlink: 'osc52' }, {}).tier).toBe(
      'osc52',
    );
    expect(renderClickAffordance('[x]', '/c:y', {}, {}).tier).toBe('plain');
  });

  it('DD-092 calibration: Wilson 95% interval ≥ 0.7 acceptance', () => {
    // 100/100 successes — calibration passes.
    expect(meetsCalibrationFloor(100, 100)).toBe(true);
    // 60/100 — calibration fails (lower bound below 0.7).
    expect(meetsCalibrationFloor(60, 100)).toBe(false);
    const i = wilson95(100, 100);
    expect(i.lower).toBeGreaterThanOrEqual(0.7);
  });

  it('SG-3 boundary: only .claude/coherence/ exists under .claude/', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const pstore = new ProposalStore(store);
    ProposalStore.resetSessionCount('s');
    await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'sg3',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    expect(existsSync(path.join(dir, '.claude', 'skills'))).toBe(false);
    expect(existsSync(path.join(dir, '.claude', 'agents'))).toBe(false);
  });
});
