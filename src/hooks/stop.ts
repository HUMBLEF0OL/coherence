/**
 * Stop hook — full pipeline wiring.
 * FR-STOP-1..21, FR-BUFFER-1
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, makeStateStore } from '../state/init.js';
import { runStopOrchestrator } from '../pipeline/stop.js';
import type { StopOrchestratorResult } from '../pipeline/stop.js';
import type { SectionIndexEntry } from '../types/index.js';
import { runAuthorPipeline, mockAuthorTransport } from '../llm/authorPipeline.js';
import { ProposalStore } from '../proposals/store.js';
import { readSignalCache } from '../signal/signalCache.js';
import { flush } from '../state/snapshotWriter.js';
import { signatureHash } from '../signal/signatureHash.js';

const SUCCESS: HookResult = { success: true };

export async function stopHook(
  event: Record<string, unknown>,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    if (sentinels.isDisabled()) return SUCCESS;

    const store = makeStateStore(projectRoot);
    const sessionId = (event['session_id'] as string | undefined) ?? `session-${Date.now()}`;

    // Load mode from config
    const config = await store.read<{ mode: 'observe' | 'graduated' }>('config.json');
    const mode = config?.mode ?? 'observe';

    // Load section index
    const sectionIndex = (await store.read<SectionIndexEntry[]>('section-index.json')) ?? [];

    const result: StopOrchestratorResult = await runStopOrchestrator({
      sessionId,
      projectRoot,
      store,
      sectionIndex,
      projectFileContents: [],
      mode,
    });

    // ----- v0.2 Author tail (D1 fix, FR-AUTHOR-1..5) -----
    try {
      await runAuthorPostStopTail(store, projectRoot, sessionId);
    } catch {
      /* Author tail failure must not corrupt v0.1 output (FR-AUTHOR-5) */
    }
    // Force snapshot flush off the hot path (FR-STATUSLINE-7).
    try {
      await flush(store, { force: true });
    } catch {
      /* flush non-fatal */
    }

    // Return additionalContext for review UI (M9 renders it properly)
    if (result.bundles.length === 0 && result.deferred === 0) {
      return SUCCESS;
    }

    const lines: string[] = [];
    if (result.bundles.length > 0) {
      lines.push(`[coherence] ${result.bundles.length} patch bundle(s) ready for review.`);
      for (const bundle of result.bundles) {
        lines.push(`  • ${bundle.summary} (${bundle.patches.length} patch(es))`);
      }
    }
    if (result.deferred > 0) {
      lines.push(`[coherence] ${result.deferred} section(s) deferred (cap limit).`);
    }
    for (const notice of result.notices) {
      lines.push(`[coherence] ${notice}`);
    }

    return {
      success: true,
      additionalContext: lines.join('\n'),
    };
  });
}

/**
 * Author pipeline post-Stop entry point. Walks the bash-repetition signal
 * cache for items that fired this session; for each, invokes the Author
 * pipeline and enqueues the result through proposalStore. The
 * `proposals_per_session ≤ 3` cap is enforced inside the store (D5).
 */
async function runAuthorPostStopTail(
  store: ReturnType<typeof makeStateStore>,
  projectRoot: string,
  sessionId: string,
): Promise<void> {
  const cache = await readSignalCache(store);
  const candidates = cache.buckets.bash_repetition.items.filter((i) => i.occurrences >= 3);
  if (candidates.length === 0) return;
  const pstore = new ProposalStore(store);
  for (const item of candidates) {
    const out = await runAuthorPipeline(
      {
        signal_kind: 'bash_repetition',
        signal_hash: item.signature_hash,
        signal_evidence: { occurrences: item.occurrences, last_seen: item.last_seen },
      },
      mockAuthorTransport,
    );
    if (out.status !== 'proposal' || !out.artifact) continue;
    const r = await pstore.enqueue({
      projectRoot,
      kind: out.kind,
      signalHash: signatureHash('tool_invocation', item.signature_hash),
      signalKind: 'bash_repetition',
      artifact: out.artifact,
      sessionId,
    });
    if (!r.enqueued && r.reason === 'session_cap') break;
  }
}
