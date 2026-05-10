/**
 * SessionStart hook — full implementation.
 * TS-4 §4.2 steps 1-9 (v0.1) + v0.2 wiring (D1 fix).
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, getQuarantineDir, initCoherenceDir, makeStateStore } from '../state/init.js';
import { runMigrations } from '../state/migrate/index.js';
import { buildSectionIndex } from '../detection/sectionIndex.js';
import { runFinalizeSweep } from '../state/finalizeSweep.js';
import { detectReverts } from '../detection/revertDetect.js';
import { recordRevert } from '../buffer/velocity.js';
import type { VelocityState } from '../types/index.js';
import { runExpirySweep } from '../proposals/expirySweep.js';
import { ProposalStore } from '../proposals/store.js';
import { flush, markDirty } from '../state/snapshotWriter.js';
import { readGraduation } from '../state/graduation.js';
import { resolveMode } from '../modes/resolver.js';
import { clearResponseCorrelation } from '../signal/telemetry.js';
import { nowIsoUtc } from '../util/time.js';

const SUCCESS: HookResult = { success: true };

interface SessionStartEvent {
  session_id?: string;
}

export async function sessionStartHook(
  event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const coherenceDir = getCoherenceDir(projectRoot);
  const sentinels = new Sentinels(coherenceDir);

  return withExceptionGuard(sentinels, async () => {
    // Step 1: kill-switch check (TS-4 §4.1)
    if (sentinels.isDisabled()) return SUCCESS;

    // Step 2: first-touch init + migrations
    await initCoherenceDir(projectRoot);
    await runMigrations(coherenceDir, getQuarantineDir(projectRoot));

    // Step 3: anchor integrity sweep (builds section index for this session)
    buildSectionIndex(projectRoot);

    // Step 4: finalize sweep (remove aged <!-- coherence-pending --> markers)
    runFinalizeSweep(projectRoot);

    // Step 5: pending.md re-validation (FR-DETECT-6, FR-BUFFER-7) — deferred output
    // Step 6: assertion evaluation — deferred output in M4 tests

    // Step 7: revert detection scan
    const store = makeStateStore(projectRoot);
    const velocityState = await store.read<VelocityState>('velocity.json');
    if (velocityState) {
      const reverts = detectReverts(projectRoot);
      let updated = velocityState;
      for (const revert of reverts) {
        const { updated: u } = recordRevert(updated, revert.sectionRef);
        updated = u;
      }
      if (reverts.length > 0) {
        await store.write('velocity.json', updated);
      }
    }

    // ----- v0.2 wiring (D1 fix) -----
    const sessionId = (event as SessionStartEvent | undefined)?.session_id ?? `session-${Date.now()}`;

    // FR-OBS-N2: clear cross-session correlation cache.
    clearResponseCorrelation();

    // Reset per-session proposal cap counter (D5).
    ProposalStore.resetSessionCount(sessionId);

    // Run proposal expiry sweep (DD-075). N3 fix: pass projectRoot so the
    // signal-recurrence fence loads recentSignalHashes from metrics.jsonl.
    try {
      await runExpirySweep(store, sessionId, { projectRoot });
    } catch {
      /* expiry sweep failure is non-fatal */
    }

    // Bootstrap initial state-snapshot (FR-STATUSLINE-10 — first-snapshot bootstrap exempt from debounce).
    // N4 fix: pass store to markDirty so per-StateStore isolation is real.
    try {
      const graduation = await readGraduation(store);
      const effective = resolveMode({ graduation, targetPath: '.' });
      const pstore = new ProposalStore(store);
      const c = await pstore.counts();
      markDirty(
        {
          schema_version: 2,
          written_at: nowIsoUtc(),
          buffer_count: 0,
          proposal_counts: c,
          mode: effective,
          degraded: sentinels.isAutoDisabled(),
        },
        store,
      );
      await flush(store, { bootstrap: true });
    } catch {
      /* snapshot bootstrap is non-fatal */
    }

    return SUCCESS;
  });
}
