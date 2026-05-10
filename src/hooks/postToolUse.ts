/**
 * PostToolUse hook — detection + buffer append + v0.2 signal detectors.
 * TS-4 §4.3 (steps 1-4 v0.1) + v0.2 wiring (D1 fix, FR-OBS-N1, DD-076/077).
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, makeStateStore } from '../state/init.js';
import { PathFilter } from '../detection/pathFilter.js';
import { readFileSync, existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'fs';
import path from 'path';
import { scanAnchors } from '../detection/anchorScanner.js';
import { hashContent } from '../buffer/contentHash.js';
import { BufferLifecycle } from '../buffer/lifecycle.js';
import { normalizePath, makeSectionRef } from '../state/pathNormaliser.js';
import type { BufferEntry, NormalizedPath } from '../types/index.js';
import { nowIsoUtc } from '../util/time.js';
import { emitToolInvocationSignature } from '../signal/telemetry.js';
import { detectBashRepetition } from '../signal/bashRepetition.js';
import { detectFileCreation } from '../signal/fileCreation.js';
import { readSignalCache, writeSignalCache, appendFile } from '../signal/signalCache.js';
import { markDirty } from '../state/snapshotWriter.js';
import { emitMetric } from '../state/metrics.js';
import { ProposalStore } from '../proposals/store.js';
import { readGraduation } from '../state/graduation.js';
import { resolveMode } from '../modes/resolver.js';
import { normaliseHookEvent } from './eventShape.js';
import { rememberFileContent } from '../signal/fileLocalityCache.js';
import {
  scanTrickle,
  readScanCacheState,
  writeScanCacheState,
  TRICKLE_BUDGET_MS,
} from '../scanner/trickleScanner.js';

const SUCCESS: HookResult = { success: true };

/**
 * DD-066 (M6): trickle deep-scan idle tracker. The PostToolUse hook fires
 * on every tool invocation, so we cannot observe wall-clock idleness
 * directly. Instead we treat the time since the previous PostToolUse fire
 * (per-project) as a proxy: if a long gap elapsed before this call, the
 * host was idle, and we run a small trickle pass *before* recording the
 * new fire time. The cumulative-ms budget resets on every fire so the
 * NFR-PERF-N3 5 ms median budget cannot stack across calls.
 */
interface PostToolUseIdleState {
  lastFireMs: number;
  cumulativeTrickleMs: number;
}
const postToolUseIdleByRoot = new Map<string, PostToolUseIdleState>();

const TRICKLE_PER_TICK_CAP = 5; // ≤ 5 docs scanned per PostToolUse fire

export async function postToolUseHook(
  event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    if (sentinels.isDisabled()) return SUCCESS;

    const evt = normaliseHookEvent(event);
    const sessionId = evt.sessionId ?? `session-${Date.now()}`;
    const store = makeStateStore(projectRoot);
    const tool = evt.tool ?? '';

    // ----- v0.2: DD-068 telemetry + signal detection -----
    // P1 fix: read normalised fields (works against documented host shape).
    if (tool === 'Bash' || tool === 'Edit' || tool === 'Write') {
      try {
        await emitToolInvocationSignature(store, sessionId, {
          toolName: tool,
          ...(evt.command !== undefined ? { command: evt.command } : {}),
          ...(evt.filePath !== undefined ? { filePath: evt.filePath } : {}),
        });
      } catch {
        /* telemetry non-fatal */
      }
      if (tool === 'Bash' && typeof evt.command === 'string') {
        try {
          const cache = await readSignalCache(store);
          const result = detectBashRepetition(cache, evt.command);
          await writeSignalCache(store, result.cache);
          await emitMetric(store, {
            event: 'proposal_signal_observed',
            session_id: sessionId,
            signal_kind: 'bash_repetition',
            signal_hash: result.signature_hash,
            would_have_fired: result.fired,
            occurrences_in_window: result.occurrences_in_window,
          });
        } catch {
          /* detector non-fatal */
        }
      }
      // A5 + P2 fix: file-creation signal on Edit/Write. Locality lookup
      // uses the session-scoped fileLocalityCache (keyed by file path), not
      // the persisted signal cache (which only stores hashes).
      if (
        (tool === 'Edit' || tool === 'Write') &&
        typeof evt.filePath === 'string' &&
        existsSync(evt.filePath)
      ) {
        try {
          const fileFilter = new PathFilter(projectRoot);
          if (fileFilter.isAllowed(evt.filePath, projectRoot)) {
            const content = readFileSync(evt.filePath, 'utf8');
            const cache = await readSignalCache(store);
            const recent = rememberFileContent(evt.filePath, content);
            const r = detectFileCreation(
              cache,
              evt.filePath,
              content,
              recent.tokens,
              undefined,
              recent.imports,
              recent.headings,
            );
            const next = appendFile(
              cache,
              r.signature_hash,
              r.directory_hash,
              new Date().toISOString(),
            );
            await writeSignalCache(store, next);
            await emitMetric(store, {
              event: 'proposal_signal_observed',
              session_id: sessionId,
              signal_kind: 'file_creation',
              signal_hash: r.signature_hash,
              would_have_fired: r.fired,
              occurrences_in_locality: r.occurrences_in_locality,
            });
          }
        } catch {
          /* detector non-fatal */
        }
      }
    }

    // ----- v0.1: drift-buffer append for markdown anchors -----
    const filePath = evt.filePath;
    if (filePath) {
      const filter = new PathFilter(projectRoot);
      if (
        filter.isAllowed(filePath, projectRoot) &&
        filePath.endsWith('.md') &&
        existsSync(filePath)
      ) {
        try {
          const source = readFileSync(filePath, 'utf8');
          const { sections } = scanAnchors(source, filePath);
          if (sections.length > 0) {
            const buffer = new BufferLifecycle(store);
            const normalizedPath = normalizePath(filePath) as NormalizedPath;
            for (const section of sections) {
              const entry: BufferEntry = {
                path: normalizedPath,
                sectionRef: makeSectionRef(normalizedPath, section.id),
                contentHash: hashContent(section.content),
                triggeredAt: nowIsoUtc(),
                source: 'posttooluse',
              };
              await buffer.append(entry);
            }
          }
        } catch {
          /* read/scan non-fatal */
        }
      }
    }

    // ----- DD-066 / FR-TRICKLE-1..N: trickle deep-scan on idle path -----
    // Spec M6: PostToolUse runs the trickle scanner when host idle ≥
    // idle_threshold_ms AND per-session cap not yet reached AND
    // cumulative ms in this PostToolUse fire < TRICKLE_BUDGET_MS.
    // The audit flagged this path as missing — only SessionEnd was wired.
    try {
      const idleState = postToolUseIdleByRoot.get(projectRoot) ?? {
        lastFireMs: 0,
        cumulativeTrickleMs: 0,
      };
      const nowMs = Date.now();
      const idleMs = idleState.lastFireMs === 0 ? 0 : nowMs - idleState.lastFireMs;
      const trickleState = await readScanCacheState(store);
      if (
        idleMs >= trickleState.idle_threshold_ms &&
        trickleState.entries_this_session < trickleState.per_session_cap &&
        idleState.cumulativeTrickleMs < TRICKLE_BUDGET_MS
      ) {
        const candidates = collectAnchoredDocs(projectRoot).slice(0, TRICKLE_PER_TICK_CAP);
        const r = scanTrickle(trickleState, {
          candidatePaths: candidates,
          idleMs,
          cumulativeMs: idleState.cumulativeTrickleMs,
        });
        if (r.scanned.length > 0) {
          await writeScanCacheState(store, r.state);
          await appendTrickleEntries(store, r.scanned);
          await emitMetric(store, {
            event: 'trickle_scan_pass',
            session_id: sessionId,
            scanned_count: r.scanned.length,
          });
        }
        idleState.cumulativeTrickleMs += r.ms_used;
      }
      // Always record this fire as the new "last seen tool call" — even if
      // we ran a pass, the next call's idle window starts now.
      idleState.lastFireMs = nowMs;
      postToolUseIdleByRoot.set(projectRoot, idleState);
    } catch {
      /* trickle path is best-effort */
    }

    // ----- v0.2: snapshot mark-dirty (DD-084 hot-path-zero-cost) -----
    // N4 fix: pass store so per-StateStore WeakMap isolation applies.
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

    return SUCCESS;
  });
}

/** DD-066: scan project tree for anchored markdown docs (mirrors sessionEnd). */
const TRICKLE_WALK_CAP = 500;
const TRICKLE_WALK_MAX_DEPTH = 8;
const ANCHOR_PROBE_BYTES = 4096;
const TRICKLE_SKIP_DIRS = new Set([
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

function trickleHasAnchorMarker(filePath: string): boolean {
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

function collectAnchoredDocs(projectRoot: string): string[] {
  const out: string[] = [];
  function walk(dir: string, depth: number): void {
    if (depth > TRICKLE_WALK_MAX_DEPTH) return;
    if (out.length >= TRICKLE_WALK_CAP) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (TRICKLE_SKIP_DIRS.has(name)) continue;
      if (out.length >= TRICKLE_WALK_CAP) return;
      const full = path.join(dir, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full, depth + 1);
      else if (st.isFile() && full.endsWith('.md')) {
        if (trickleHasAnchorMarker(full)) out.push(full);
      }
    }
  }
  if (existsSync(projectRoot)) walk(projectRoot, 0);
  return out.sort();
}

async function appendTrickleEntries(
  store: ReturnType<typeof makeStateStore>,
  scannedPaths: string[],
): Promise<void> {
  const lifecycle = new BufferLifecycle(store);
  for (const docPath of scannedPaths) {
    try {
      const source = readFileSync(docPath, 'utf8');
      const { sections } = scanAnchors(source, docPath);
      if (sections.length === 0) continue;
      const normalizedPath = normalizePath(docPath) as NormalizedPath;
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
      /* per-doc errors must not abort the trickle pass */
    }
  }
}

/** Test hook: clear the per-project idle tracker. */
export function _resetPostToolUseIdleState(): void {
  postToolUseIdleByRoot.clear();
}
