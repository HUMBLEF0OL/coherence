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
import { flush } from '../state/snapshotWriter.js';
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
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import path from 'path';
import type { HostCapabilities } from '../types/index.js';

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

    // ----- A2 + A3 fix: trickle deep-scan + annotate auto-firing -----
    try {
      const graduation = await readGraduation(store);
      const trickleState = await readScanCacheState(store);
      const allDocs = collectMarkdownDocs(projectRoot);
      // Idle gate uses session-end as the idle moment (no in-flight tools).
      const idleMs = Number.MAX_SAFE_INTEGER;
      const r = scanTrickle(trickleState, {
        candidatePaths: allDocs,
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

        // A3 + P7: when graduation mode for a doc's scope is `annotate`
        // or `author`, run the annotate proposer over scanned docs.
        // Memoise content reads so we don't re-read the same doc twice.
        const caps = await store.read<HostCapabilities>('host-capabilities.json');
        const preserves = caps?.frontmatter_preserves_unknown_keys ?? false;
        const pstore = new ProposalStore(store);
        const docCache = new Map<string, string | null>();
        for (const docPath of r.scanned) {
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
          if (proposal.status !== 'proposal') continue;
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
 * Walk the project tree under `projectRoot` and return at most
 * `MARKDOWN_WALK_CAP` `.md` files (lex-sorted, project-relative absolute
 * paths). P6 fix: bounded by file-count and depth so a deep monorepo
 * cannot blow past the NFR-PERF-N3 5 ms median budget at SessionEnd.
 */
const MARKDOWN_WALK_CAP = 500;
const MARKDOWN_WALK_MAX_DEPTH = 8;

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
      else if (st.isFile() && full.endsWith('.md')) out.push(full);
    }
  }

  if (existsSync(projectRoot)) walk(projectRoot, 0);
  return out.sort();
}
