/**
 * SessionEnd hook — buffer persistence + v0.2 prune/flush + correlation clear.
 * TS-4 §4.7 (v0.1) + v0.2 wiring (D1 fix).
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, makeStateStore } from '../state/init.js';
import { BufferLifecycle } from '../buffer/lifecycle.js';
import { readSignalCache, writeSignalCache, pruneSignalCache } from '../signal/signalCache.js';
import { flush, markDirty } from '../state/snapshotWriter.js';
import { nowIsoUtc } from '../util/time.js';
import { clearResponseCorrelation } from '../signal/telemetry.js';
import { resetFileLocalityCache } from '../signal/fileLocalityCache.js';
import { normaliseHookEvent } from './eventShape.js';
import { emitMetric } from '../state/metrics.js';
import {
  scanTrickle,
  readScanCacheState,
  writeScanCacheState,
} from '../scanner/trickleScanner.js';
import { readGraduation } from '../state/graduation.js';
import { resolveMode } from '../modes/resolver.js';
import { ProposalStore } from '../proposals/store.js';
import { proposeAnnotate } from '../proposers/annotateProposer.js';
import { signatureHash } from '../signal/signatureHash.js';
import {
  detectAgentCorrection,
  DEFAULT_AGENT_CORRECTION_LINE_RATIO,
  DEFAULT_AGENT_CORRECTION_COUNT,
  type CorrectionSample,
} from '../signal/agentCorrection.js';
import type { CoherenceConfig, BufferEntry, HostCapabilities } from '../types/index.js';
import {
  runAuthorPipeline,
  mockAuthorTransport,
  liveAuthorTransport,
  type AuthorTransport,
} from '../llm/authorPipeline.js';
import {
  existsSync,
  readFileSync,
  statSync,
  readdirSync,
  openSync,
  readSync,
  closeSync,
} from 'fs';
import path from 'path';

import { scanAnchors } from '../detection/anchorScanner.js';
import { hashContent } from '../buffer/contentHash.js';
import { normalizePath, makeSectionRef } from '../state/pathNormaliser.js';
import type { StateStore } from '../state/stateStore.js';

const SUCCESS: HookResult = { success: true };

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export async function sessionEndHook(
  event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    if (sentinels.isDisabled()) return SUCCESS;

    const store = makeStateStore(projectRoot);
    const evt = normaliseHookEvent(event);
    const sessionId = evt.sessionId ?? `session-${Date.now()}`;
    const buffer = new BufferLifecycle(store);

    // Persist deferred buffer to pending.md
    const buf = await buffer.read();
    if (buf.state === 'pending' && buf.entries.length > 0) {
      await buffer.defer();
    }

    // ----- v0.2: signal-cache prune (FR-AUTHOR-14, 7-day rolling window) -----
    try {
      const cache = await readSignalCache(store);
      const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
      const pruned = pruneSignalCache(cache, cutoff);
      const total =
        pruned.removed.bash_repetition +
        pruned.removed.file_creation +
        pruned.removed.agent_correction;
      if (total > 0) {
        await writeSignalCache(store, pruned.cache);
        await emitMetric(store, {
          event: 'signal_cache_pruned',
          session_id: sessionId,
          ...pruned.removed,
        });
      }
    } catch {
      /* prune non-fatal */
    }

    // ----- Q4 fix: SessionEnd Author tail for agent_correction -----
    // The plan (M6) requires a SessionEnd Author entry point so that
    // agent_correction signals don't age out of the cache without ever
    // being authored if Stop didn't fire (force-kill, compaction restart).
    // Stop's tail (A6) covers all 3 signal kinds when it fires, but
    // SessionEnd is the last guarantee. The proposals_per_session ≤ 3
    // cap is shared via ProposalStore.peekSessionCount.
    try {
      await runSessionEndAuthorTail(store, projectRoot, sessionId);
    } catch {
      /* Author tail at SessionEnd is non-fatal */
    }

    // ----- A2 + A3 fix: trickle deep-scan + annotate auto-firing -----
    try {
      const graduation = await readGraduation(store);
      const trickleState = await readScanCacheState(store);
      // DD-066: trickle deep-scan walks *anchored* docs to refresh their
      // sectionRef contentHashes; annotate auto-firing walks *anchorless*
      // docs to propose an anchored rewrite. Two distinct candidate sets.
      const anchoredDocs = collectAnchoredDocs(projectRoot);
      const anchorlessDocs = collectMarkdownDocs(projectRoot);
      const candidates = [...anchoredDocs, ...anchorlessDocs];
      // Idle gate uses session-end as the idle moment (no in-flight tools).
      const idleMs = Number.MAX_SAFE_INTEGER;
      const r = scanTrickle(trickleState, {
        candidatePaths: candidates,
        idleMs,
        cumulativeMs: 0,
      });
      if (r.scanned.length > 0) {
        await writeScanCacheState(store, r.state);
        await emitMetric(store, {
          event: 'trickle_scan_pass',
          session_id: sessionId,
          scanned_count: r.scanned.length,
        });

        // DD-066: for the subset of scanned paths that ARE anchored, append
        // `trickle_deep_scan` entries to the drift-buffer. Without this the
        // widened drift-buffer enum value would be unreachable from runtime.
        const anchoredSet = new Set(anchoredDocs);
        const scannedAnchored = r.scanned.filter((p) => anchoredSet.has(p));
        if (scannedAnchored.length > 0) {
          await appendTrickleEntries(store, projectRoot, scannedAnchored);
        }

        // A3: when graduation mode for a doc's scope is `annotate`
        // or `author`, run the annotate proposer over scanned docs.
        // The docCache memoises within this loop in case the trickle
        // scanner ever returns duplicate paths (defensive; today each
        // path appears once per scan).
        const anchorlessSet = new Set(anchorlessDocs);
        const caps = await store.read<HostCapabilities>('host-capabilities.json');
        const preserves = caps?.frontmatter_preserves_unknown_keys ?? false;
        const pstore = new ProposalStore(store);
        const docCache = new Map<string, string | null>();
        for (const docPath of r.scanned) {
          if (!anchorlessSet.has(docPath)) continue; // annotate runs on anchorless docs only
          const rel = path.relative(projectRoot, docPath).replace(/\\/g, '/');
          const mode = resolveMode({ graduation, targetPath: rel });
          if (mode !== 'annotate' && mode !== 'author') continue;
          if (ProposalStore.peekSessionCount(sessionId) >= 3) break;
          let body = docCache.get(docPath);
          if (body === undefined) {
            try {
              body = readFileSync(docPath, 'utf8');
            } catch {
              body = null;
            }
            docCache.set(docPath, body);
          }
          if (body === null) continue;
          const proposal = proposeAnnotate({
            body,
            basename: path.basename(docPath, path.extname(docPath)),
            preservesUnknownFrontmatter: preserves,
          });
          if (proposal.status !== 'proposal') {
            // Q7: emit annotate_blocked for parity with the manual
            // /coherence:annotate command which already does this.
            await emitMetric(store, {
              event: 'annotate_blocked',
              session_id: sessionId,
              ...(proposal.reason ? { reason: proposal.reason } : {}),
              source: 'auto',
              doc_path_hash: signatureHash('file_write_path', rel),
            });
            continue;
          }
          await pstore.enqueue({
            projectRoot,
            kind: 'annotate',
            signalHash: signatureHash('file_write_path', rel),
            signalKind: 'anchor_less_doc',
            artifact: { filename: 'PROPOSAL.md', content: proposal.body_md },
            sessionId,
            targetPath: rel,
          });
        }
      }
    } catch {
      /* trickle/auto-annotate non-fatal */
    }

    // Refresh the pending snapshot to capture trickle/auto-annotate
    // enqueues + agent_correction proposals before the final flush.
    try {
      const graduation = await readGraduation(store);
      const effective = resolveMode({ graduation, targetPath: '.' });
      const pstore = new ProposalStore(store);
      const counts = await pstore.counts();
      const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');
      markDirty(
        {
          schema_version: 2,
          written_at: nowIsoUtc(),
          buffer_count: buf?.entries.length ?? 0,
          proposal_counts: counts,
          mode: effective,
        },
        store,
      );
    } catch {
      /* mark-dirty non-fatal */
    }

    // Force final snapshot flush + clear cross-session correlation cache.
    try {
      await flush(store, { force: true });
    } catch {
      /* flush non-fatal */
    }
    clearResponseCorrelation();
    resetFileLocalityCache();

    return SUCCESS;
  });
}

/**
 * Pick the Author transport at hook-invocation time (mirrors stop.ts):
 *   COHERENCE_AUTHOR_LIVE=1 → live; COHERENCE_AUTHOR_MOCK=1 → mock;
 *   default: live iff ANTHROPIC_API_KEY is set, mock otherwise.
 */
function pickAuthorTransport(): AuthorTransport {
  const env = process.env;
  if (env['COHERENCE_AUTHOR_MOCK'] === '1') return mockAuthorTransport;
  if (env['COHERENCE_AUTHOR_LIVE'] === '1') return liveAuthorTransport;
  if (env['ANTHROPIC_API_KEY']) return liveAuthorTransport;
  return mockAuthorTransport;
}

/**
 * Q4: SessionEnd Author tail.
 *
 * Walks the agent_correction bucket and authors a proposal per agent that
 * crossed the threshold. The bash + file_creation kinds are handled at
 * Stop (A6); SessionEnd specifically covers the agent_correction case
 * which the plan (M6) calls out as SessionEnd-only because the
 * invocation-aggregate ratio is only computable mid-session.
 *
 * Subject to the shared `proposals_per_session ≤ 3` cap (D5).
 */
async function runSessionEndAuthorTail(
  store: ReturnType<typeof makeStateStore>,
  projectRoot: string,
  sessionId: string,
): Promise<void> {
  const cache = await readSignalCache(store);
  // Audit fix: gate proposal firing through the canonical
  // `detectAgentCorrection` detector rather than the precomputed bucket
  // aggregate alone. The bucket stores (occurrences, max line_ratio) per
  // agent — those numbers feed a synthetic CorrectionSample so the
  // detector applies its full reasons/ratio logic + records the burst-
  // window calibration field for DD-092 alpha-telemetry. Without this
  // call, `detectAgentCorrection` was dead code (audit M9-A).
  //
  // v0.2 calibration: the user may override detector defaults from
  // `config.json` (see `config.schema.json`). Fields are optional; when
  // absent the detector falls back to its `DEFAULT_*` constants.
  const userConfig = await store.read<CoherenceConfig>('config.json');
  const lineRatioCfg = userConfig?.agent_correction_line_ratio ?? DEFAULT_AGENT_CORRECTION_LINE_RATIO;
  const occurrenceCountCfg = userConfig?.agent_correction_count ?? DEFAULT_AGENT_CORRECTION_COUNT;
  const candidates = cache.buckets.agent_correction.items.filter((i) => {
    if (i.occurrences < occurrenceCountCfg) return false;
    if (i.line_ratio < lineRatioCfg) return false;
    // Build a minimal sample set from the bucket aggregate. The bucket
    // does not retain per-invocation samples (D5 schema), so we synthesise
    // `occurrences` samples at `last_seen` carrying the max ratio. This
    // gives the detector enough to confirm threshold + record burst
    // calibration; per-sample timestamps will land in v0.2.1 per DD-092.
    const samples: CorrectionSample[] = Array.from({ length: i.occurrences }, () => ({
      agent_id: i.agent_id,
      at: i.last_seen,
      lines_changed: Math.round(i.line_ratio * 100),
      total_lines: 100,
    }));
    const result = detectAgentCorrection(samples, i.agent_id, new Date(), {
      lineRatio: lineRatioCfg,
      occurrenceCount: occurrenceCountCfg,
      ...(userConfig?.agent_correction_window_min !== undefined
        ? { windowMinutes: userConfig.agent_correction_window_min }
        : {}),
      ...(userConfig?.agent_correction_window_days !== undefined
        ? { windowDays: userConfig.agent_correction_window_days }
        : {}),
      ...(userConfig?.agent_correction_require_burst !== undefined
        ? { requireBurst: userConfig.agent_correction_require_burst }
        : {}),
    });
    return result.fired;
  });
  if (candidates.length === 0) return;

  // R11 fix: pre-filter candidates whose signal_hash already has a
  // non-terminal proposal-cache entry. Stop's tail (A6) walks the same
  // bucket; without this filter, SessionEnd re-iterates and the
  // collision pre-check refuses each one (correct but noisy + lock-thrashy).
  const proposalCacheRaw = await store.read<{ entries: Array<{ signal_hash?: string; state?: string }> }>(
    'proposal-cache.json',
  );
  const NON_TERMINAL = new Set(['queued', 'surfaced', 'ignored']);
  const alreadyAuthored = new Set<string>();
  for (const e of proposalCacheRaw?.entries ?? []) {
    if (e.signal_hash && e.state && NON_TERMINAL.has(e.state)) {
      alreadyAuthored.add(e.signal_hash);
    }
  }

  const transport = pickAuthorTransport();
  const pstore = new ProposalStore(store);
  for (const item of candidates) {
    if (ProposalStore.peekSessionCount(sessionId) >= 3) break;
    const sigHash = signatureHash('agent_correction', item.agent_id);
    if (alreadyAuthored.has(sigHash)) continue; // R11
    let out;
    try {
      out = await runAuthorPipeline(
        {
          signal_kind: 'agent_correction',
          signal_hash: sigHash,
          signal_evidence: {
            agent_id_hash: sigHash,
            ratio: item.line_ratio,
            occurrences_in_window: item.occurrences,
          },
        },
        transport,
      );
    } catch {
      continue;
    }
    if (out.status !== 'proposal' || !out.artifact) continue;
    const r = await pstore.enqueue({
      projectRoot,
      kind: out.kind,
      signalHash: sigHash,
      signalKind: 'agent_correction',
      artifact: out.artifact,
      sessionId,
    });
    if (!r.enqueued && r.reason === 'session_cap') break;
  }
}

/**
 * Walk the project tree under `projectRoot` and return at most
 * `MARKDOWN_WALK_CAP` `.md` files (lex-sorted, project-relative absolute
 * paths). P6 fix: bounded by file-count and depth so a deep monorepo
 * cannot blow past the NFR-PERF-N3 5 ms median budget at SessionEnd.
 */
const MARKDOWN_WALK_CAP = 500;
const MARKDOWN_WALK_MAX_DEPTH = 8;

/**
 * Q11: pre-filter helper. Reads the first 4 KB of a doc and returns true
 * if it already contains a coherence anchor. Called by collectMarkdownDocs
 * as a coarse filter so the trickle scanner / annotate proposer don't
 * waste cycles on already-anchored docs.
 */
const ANCHOR_PROBE_BYTES = 4096;
function hasAnchorMarker(filePath: string): boolean {
  try {
    const handle = openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(ANCHOR_PROBE_BYTES);
      const n = readSync(handle, buf, 0, ANCHOR_PROBE_BYTES, 0);
      const head = buf.subarray(0, n).toString('utf8');
      return /<!--\s*coherence:section\s+[a-z0-9_-]+\s*-->/i.test(head);
    } finally {
      closeSync(handle);
    }
  } catch {
    return false;
  }
}

function collectMarkdownDocs(projectRoot: string): string[] {
  const out: string[] = [];
  const skipDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    'coverage',
    'build',
    '.claude',
    '.next',
    '.cache',
    '.idea',
    '.vscode',
  ]);

  function walk(dir: string, depth: number): void {
    if (depth > MARKDOWN_WALK_MAX_DEPTH) return;
    if (out.length >= MARKDOWN_WALK_CAP) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (skipDirs.has(name)) continue;
      if (out.length >= MARKDOWN_WALK_CAP) return;
      const full = path.join(dir, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full, depth + 1);
      else if (st.isFile() && full.endsWith('.md')) {
        // Q11: skip docs that already have a coherence anchor — saves the
        // trickle scanner + annotate proposer from work that will refuse.
        if (hasAnchorMarker(full)) continue;
        out.push(full);
      }
    }
  }

  if (existsSync(projectRoot)) walk(projectRoot, 0);
  return out.sort();
}

/**
 * DD-066 trickle candidate collector — markdown docs that DO contain a
 * coherence anchor in their first 4 KB. Mirrors collectMarkdownDocs but
 * inverts the anchor-marker filter: trickle deep-scan re-validates
 * anchored docs while annotate auto-firing operates on anchorless docs.
 */
function collectAnchoredDocs(projectRoot: string): string[] {
  const out: string[] = [];
  const skipDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    'coverage',
    'build',
    '.claude',
    '.next',
    '.cache',
    '.idea',
    '.vscode',
  ]);

  function walk(dir: string, depth: number): void {
    if (depth > MARKDOWN_WALK_MAX_DEPTH) return;
    if (out.length >= MARKDOWN_WALK_CAP) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (skipDirs.has(name)) continue;
      if (out.length >= MARKDOWN_WALK_CAP) return;
      const full = path.join(dir, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full, depth + 1);
      else if (st.isFile() && full.endsWith('.md')) {
        if (hasAnchorMarker(full)) out.push(full);
      }
    }
  }

  if (existsSync(projectRoot)) walk(projectRoot, 0);
  return out.sort();
}

/**
 * DD-066: append `trickle_deep_scan` entries to drift-buffer.json for each
 * anchored doc the scanner visited. One entry per (doc, section) pair.
 * Errors per file are swallowed — the trickle path is best-effort and must
 * never fail the SessionEnd hook.
 */
async function appendTrickleEntries(
  store: StateStore,
  projectRoot: string,
  scannedPaths: string[],
): Promise<void> {
  const lifecycle = new BufferLifecycle(store);
  for (const docPath of scannedPaths) {
    try {
      const source = readFileSync(docPath, 'utf8');
      const { sections } = scanAnchors(source, docPath);
      if (sections.length === 0) continue;
      const normalizedPath = normalizePath(docPath);
      for (const section of sections) {
        const entry: BufferEntry = {
          path: normalizedPath,
          sectionRef: makeSectionRef(normalizedPath, section.id),
          contentHash: hashContent(section.content),
          triggeredAt: nowIsoUtc(),
          source: 'trickle_deep_scan',
        };
        await lifecycle.append(entry);
      }
    } catch {
      /* per-doc failures must not abort the trickle pass */
    }
    void projectRoot; // reserved for future relativisation; keeps signature stable
  }
}
