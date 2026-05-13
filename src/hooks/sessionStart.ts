/**
 * SessionStart hook — full implementation.
 * TS-4 §4.2 steps 1-9 (v0.1) + v0.2 wiring (D1 fix).
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, makeStateStore } from '../state/init.js';
import { refuseLegacy, refuseLayout } from '../state/refuseLegacy.js';
import { runFreshInstall } from '../state/firstRun.js';
import { runRetentionSweep } from '../state/metricsRetention.js';
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
import { resetFileLocalityCache } from '../signal/fileLocalityCache.js';
import { resetScopeCacheMissCounter } from '../state/scope/cache.js';
import { applyTeamIgnoreSweep } from '../proposals/teamIgnore.js';
import { evaluateTriggerContracts } from '../state/triggerContracts.js';
import type { ProposalCacheEntry } from '../state/proposalCache.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import type { ProposalManifest } from '../proposals/manifest.js';
import { withCacheLock } from '../state/locks.js';
import { readScanCacheState, writeScanCacheState } from '../scanner/trickleScanner.js';
import { nowIsoUtc } from '../util/time.js';
import { normaliseHookEvent } from './eventShape.js';
import { checkPromoteEligibility, readLedger, writeLedger } from '../state/trustLedger.js';
import { runAutoAcceptSweep } from '../proposals/autoAcceptSweep.js';

const SUCCESS: HookResult = { success: true };

export async function sessionStartHook(
  event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const coherenceDir = getCoherenceDir(projectRoot);
  const sentinels = new Sentinels(coherenceDir);

  return withExceptionGuard(sentinels, async () => {
    // Step 1: kill-switch check (TS-4 §4.1)
    if (sentinels.isDisabled()) return SUCCESS;

    // Step 1b: v0.4 DD-122 — refuse old manifest layout (plugin.json at
    // plugin root). CLAUDE_PLUGIN_ROOT is set by Claude Code when running
    // a plugin's hooks; it points to the plugin's installation directory,
    // NOT the user's projectRoot.
    const pluginInstallRoot = process.env['CLAUDE_PLUGIN_ROOT'] ?? '';
    const layoutDecision = refuseLayout(pluginInstallRoot);
    if (layoutDecision) {
      console.error(`[coherence] ${layoutDecision.message}`);
      return { success: true, refusedLegacy: true };
    }

    // Step 2: v0.3 NFR-COMPAT-N4 — refuse pre-v3 state, fresh-install otherwise.
    // DD-118 retired the cross-major-version migration chain; SessionStart now
    // consults `refuseLegacy()` before laying down v3 state. A future-major
    // (e.g. v4) install seen on disk gets a distinct message so the operator
    // does not delete state thinking it's legacy.
    //
    // Audit-3 S4: gate refuseLegacy + runFreshInstall under a path lock so
    // two SessionStart hooks racing on the same project don't see partial
    // version.json mid-write. The lock target is the version.json path
    // itself; a non-existent parent dir is fine — LockManager mkdir-recursives.
    const versionLockTarget = path.join(coherenceDir, 'version.json');
    const decision = await withCacheLock(versionLockTarget, 'session-start', async () => {
      const initial = refuseLegacy(coherenceDir);
      if (initial.status === 'fresh') {
        await runFreshInstall(projectRoot);
      }
      // Re-read after install so the returned decision reflects post-state.
      return refuseLegacy(coherenceDir);
    });
    if (decision.status === 'refuse' || decision.status === 'refuse_future') {
      console.error(`[coherence] ${decision.message}`);
      return { success: true, refusedLegacy: true };
    }
    // 'proceed' / 'fresh' (already laid) — fall through.

    // v0.4: pulled up from Step 7 — needed by Step 2b trigger-contract
    // evaluation and Step 7 revert detection alike.
    const store = makeStateStore(projectRoot);

    // Step 2b: v0.4 G-3 — telemetry-gated trigger contracts (DD-129,
    // FR-TRIGGER-1). Reads metrics.jsonl via P8 bounded-read; emits one-time
    // CLI hints when thresholds are met. Non-fatal; never blocks startup.
    try {
      const hints = await evaluateTriggerContracts(store, coherenceDir);
      for (const hint of hints) {
        console.log(`[coherence] ${hint}`);
      }
    } catch {
      /* trigger-contract evaluation is non-fatal */
    }

    // Step 3: anchor integrity sweep (builds section index for this session)
    buildSectionIndex(projectRoot);

    // Step 4: finalize sweep (remove aged <!-- coherence-pending --> markers)
    runFinalizeSweep(projectRoot);

    // Step 5: pending.md re-validation (FR-DETECT-6, FR-BUFFER-7) — deferred output
    // Step 6: assertion evaluation — deferred output in M4 tests

    // Step 7: revert detection scan
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
    // P1 fix: read sessionId via the documented host shape too.
    const evt = normaliseHookEvent(event);
    const sessionId = evt.sessionId ?? `session-${Date.now()}`;

    // DD-080 retired in v0.3 (DD-118): no migration chain, no
    // `migration_completed` event to emit. Pre-v3 installs are refused above.

    // FR-OBS-N2: clear cross-session correlation cache.
    clearResponseCorrelation();

    // P2: reset session-scoped file-locality cache.
    resetFileLocalityCache();

    // v0.3 M1: reset per-process scope-cache miss sampling counter so the
    // 1:100 telemetry rate is genuinely per-session.
    resetScopeCacheMissCounter();

    // Reset per-session proposal cap counter (D5).
    ProposalStore.resetSessionCount(sessionId);

    // Q3 fix: reset trickle scanner's per-session counter so the
    // `per_session_cap` is genuinely a per-session bound, not a one-way
    // ratchet that dies after ~20 cumulative sessions.
    try {
      const scanState = await readScanCacheState(store);
      if (scanState.entries_this_session !== 0) {
        await writeScanCacheState(store, { ...scanState, entries_this_session: 0 });
      }
    } catch {
      /* scan-cache reset non-fatal */
    }

    // Run proposal expiry sweep (DD-075). N3 fix: pass projectRoot so the
    // signal-recurrence fence loads recentSignalHashes from metrics.jsonl.
    try {
      await runExpirySweep(store, sessionId, { projectRoot });
    } catch {
      /* expiry sweep failure is non-fatal */
    }

    // v0.3 M2 (audit-3 B2): team-ignore FSM sweep. Reads committed
    // `coherence/ignore` lines and transitions any non-terminal proposal
    // whose anchor matches to `ignored_by_team`. The anchor resolver is
    // kind-aware: annotate proposals carry `target_path` (the source doc);
    // signal-kind proposals (skill/slash_command/agent) carry their
    // `signal_hash` only — no anchor extractable today, so they're skipped.
    try {
      await runTeamIgnoreSweepFromCommittedFile(store, sessionId, projectRoot);
    } catch {
      /* team-ignore sweep is best-effort */
    }

    // v1.0 M1 — one-time promote hint (FR-TRUST-1). If the ledger meets all
    // three thresholds AND the hint has not yet been emitted, write a stderr
    // notice and stamp `promote_hint_emitted_at` atomically.
    try {
      const eligibility = await checkPromoteEligibility(store);
      if (eligibility.eligible && !eligibility.hint_emitted) {
        console.error(
          '[coherence] Your trust score qualifies for auto-land. Run /coherence:trust --promote --auto-land annotate to activate.',
        );
        const ledger = await readLedger(store);
        ledger.promote_hint_emitted_at = nowIsoUtc();
        await writeLedger(store, ledger);
      }
    } catch {
      /* promote hint is non-fatal */
    }

    // v1.0 M1 Step 7 — Net-new file gate relaxation (FR-TRUST-3).
    // For promoted developers, auto-accept surfaced proposals whose kind is
    // in `auto_land_kinds`. Kinds outside that set still require explicit
    // /coherence:propose-accept (DD-065 preserved). Non-promoted developers
    // see no change.
    try {
      const result = await runAutoAcceptSweep(store, projectRoot, sessionId);
      if (result.accepted.length > 0) {
        console.error(
          `[coherence] auto-landed ${result.accepted.length} proposal(s) for promoted auto-land kinds: ${result.accepted.map((a) => `${a.kind}/${a.proposalId.slice(0, 8)}`).join(', ')}`,
        );
      }
    } catch {
      /* auto-accept sweep is non-fatal */
    }

    // T4 fix: 90-day metrics.jsonl retention sweep (NFR-OBS-2, DD-060).
    // The v0.1 sweep wrote a metrics-summary.json once; v0.2 reuses it
    // every SessionStart so the rolling window stays bounded. Without
    // this, expirySweep's tail-read (P8) starts dropping entries past
    // 5 MB before the retention sweep would have aggregated them.
    try {
      await runRetentionSweep(store, coherenceDir);
    } catch {
      /* retention non-fatal */
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

/**
 * v0.3 audit-3 B2 helper: read committed `coherence/ignore` (DD-096
 * team-shared file) and apply the FSM team-ignore sweep. The anchor
 * resolver reads each proposal's manifest at
 * `.claude/coherence/proposals/<kind>/<id>/manifest.json` and returns its
 * `target_path` if present (annotate kind). Non-annotate kinds have no
 * extractable anchor today, so they're skipped — `applyTeamIgnoreSweep`
 * tolerates `resolveAnchor` returning undefined.
 */
/** Audit-4 E: cap on `coherence/ignore` read so a hostile file can't OOM the session. */
const COHERENCE_IGNORE_MAX_BYTES = 1 * 1024 * 1024;

async function runTeamIgnoreSweepFromCommittedFile(
  store: StateStore,
  sessionId: string,
  projectRoot: string,
): Promise<void> {
  const ignorePath = path.join(projectRoot, 'coherence', 'ignore');
  if (!existsSync(ignorePath)) return;
  // Audit-4 E: bound the read so a hostile or accidentally-committed
  // multi-MB ignore file can't blow up SessionStart.
  let raw: string;
  try {
    const { statSync, openSync, readSync, closeSync } = await import('fs');
    const st = statSync(ignorePath);
    if (st.size <= COHERENCE_IGNORE_MAX_BYTES) {
      raw = readFileSync(ignorePath, 'utf8');
    } else {
      const fd = openSync(ignorePath, 'r');
      try {
        const buf = Buffer.alloc(COHERENCE_IGNORE_MAX_BYTES);
        readSync(fd, buf, 0, COHERENCE_IGNORE_MAX_BYTES, 0);
        raw = buf.toString('utf8');
      } finally {
        closeSync(fd);
      }
      console.warn(
        `[coherence] team-ignore sweep: coherence/ignore is ${st.size} bytes (> ${COHERENCE_IGNORE_MAX_BYTES}); read first ${COHERENCE_IGNORE_MAX_BYTES} bytes only`,
      );
    }
  } catch {
    return;
  }
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length === 0) return;

  await applyTeamIgnoreSweep({
    store,
    sessionId,
    ignoreLines: lines,
    resolveAnchor: (entry: ProposalCacheEntry) => {
      const manifestPath = path.join(
        projectRoot,
        '.claude',
        'coherence',
        'proposals',
        entry.kind,
        entry.proposal_id,
        'manifest.json',
      );
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as ProposalManifest;
        return m.target_path;
      } catch {
        return undefined;
      }
    },
  });
}
