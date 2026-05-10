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
import { readSignalCache, writeSignalCache } from '../signal/signalCache.js';
import { markDirty } from '../state/snapshotWriter.js';
import { emitMetric } from '../state/metrics.js';
import { ProposalStore } from '../proposals/store.js';
import { readGraduation } from '../state/graduation.js';
import { resolveMode } from '../modes/resolver.js';

interface PostToolUseEvent {
  tool?: string;
  path?: string;
  command?: string;
  session_id?: string;
  [key: string]: unknown;
}

const SUCCESS: HookResult = { success: true };

export async function postToolUseHook(
  event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    if (sentinels.isDisabled()) return SUCCESS;

    const evt = event as PostToolUseEvent;
    const sessionId = evt.session_id ?? `session-${Date.now()}`;
    const store = makeStateStore(projectRoot);
    const tool = evt.tool ?? '';

    // ----- v0.2: DD-068 telemetry + signal detection -----
    if (tool === 'Bash' || tool === 'Edit' || tool === 'Write') {
      try {
        await emitToolInvocationSignature(store, sessionId, {
          toolName: tool,
          ...(evt.command !== undefined ? { command: evt.command } : {}),
          ...(evt.path !== undefined ? { filePath: evt.path } : {}),
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
    }

    // ----- v0.1: drift-buffer append for markdown anchors -----
    const filePath = evt.path;
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
    try {
      const graduation = await readGraduation(store);
      const effective = resolveMode({ graduation, targetPath: '.' });
      const pstore = new ProposalStore(store);
      const counts = await pstore.counts();
      const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');
      markDirty({
        schema_version: 2,
        written_at: nowIsoUtc(),
        buffer_count: buf?.entries.length ?? 0,
        proposal_counts: counts,
        mode: effective,
      });
    } catch {
      /* mark-dirty non-fatal */
    }

    return SUCCESS;
  });
}
