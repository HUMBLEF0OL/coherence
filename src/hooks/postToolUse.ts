/**
 * PostToolUse hook — detection + buffer append + v0.2 signal detectors.
 * TS-4 §4.3 (steps 1-4 v0.1) + v0.2 wiring (D1 fix, FR-OBS-N1, DD-076/077).
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, makeStateStore } from '../state/init.js';
import { PathFilter } from '../detection/pathFilter.js';
import { readFileSync, existsSync } from 'fs';
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

const SUCCESS: HookResult = { success: true };

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
            const recentTokens = rememberFileContent(evt.filePath, content);
            const r = detectFileCreation(cache, evt.filePath, content, recentTokens);
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
