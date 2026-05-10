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
import {
  runAuthorPipeline,
  mockAuthorTransport,
  liveAuthorTransport,
  type AuthorTransport,
} from '../llm/authorPipeline.js';
import { ProposalStore } from '../proposals/store.js';
import { readSignalCache } from '../signal/signalCache.js';
import { flush } from '../state/snapshotWriter.js';
import { signatureHash } from '../signal/signatureHash.js';
import { emitAgentResponseId } from '../signal/telemetry.js';
import type { SignalKind } from '../state/proposalCache.js';

/**
 * N1 fix: pick the Author transport at hook-invocation time.
 *  - `COHERENCE_AUTHOR_LIVE=1` forces live (Anthropic SDK).
 *  - `COHERENCE_AUTHOR_MOCK=1` forces mock (deterministic).
 *  - Otherwise default to live iff `ANTHROPIC_API_KEY` is set.
 */
function pickAuthorTransport(): AuthorTransport {
  const env = process.env;
  if (env['COHERENCE_AUTHOR_MOCK'] === '1') return mockAuthorTransport;
  if (env['COHERENCE_AUTHOR_LIVE'] === '1') return liveAuthorTransport;
  if (env['ANTHROPIC_API_KEY']) return liveAuthorTransport;
  return mockAuthorTransport;
}

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

    // ----- v0.2 DD-068 agent response signature (N2 fix; P3 fix) -----
    // P3: only emit when the host event carries an explicit agent_id
    // and a non-zero response_lines. Defaulting to sessionId+0 produces
    // a session-stable digest that pollutes prior_response_id.
    try {
      const agentIdRaw = event['agent_id'] as string | undefined;
      const responseLines =
        typeof event['response_lines'] === 'number'
          ? (event['response_lines'] as number)
          : 0;
      if (agentIdRaw && responseLines > 0) {
        await emitAgentResponseId(store, sessionId, {
          agentId: agentIdRaw,
          responseLines,
        });
      }
    } catch {
      /* telemetry non-fatal */
    }

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
 * Author pipeline post-Stop entry point.
 * A6 fix: walks all three signal-cache buckets (bash, file, agent) and for
 * each item that exceeded its threshold, invokes the Author pipeline.
 * The `proposals_per_session ≤ 3` cap is enforced inside the store (D5).
 */
async function runAuthorPostStopTail(
  store: ReturnType<typeof makeStateStore>,
  projectRoot: string,
  sessionId: string,
): Promise<void> {
  const cache = await readSignalCache(store);
  const transport = pickAuthorTransport();
  const pstore = new ProposalStore(store);

  type Cand = {
    signal_kind: SignalKind;
    signal_hash: string;
    signal_evidence: Record<string, unknown>;
  };
  const candidates: Cand[] = [];
  for (const item of cache.buckets.bash_repetition.items) {
    if (item.occurrences >= 3) {
      candidates.push({
        signal_kind: 'bash_repetition',
        signal_hash: item.signature_hash,
        signal_evidence: {
          occurrences: item.occurrences,
          last_seen: item.last_seen,
          first_seen: item.first_seen,
        },
      });
    }
  }
  for (const item of cache.buckets.file_creation.items) {
    if (item.occurrences >= 3) {
      candidates.push({
        signal_kind: 'file_creation',
        signal_hash: item.signature_hash,
        signal_evidence: {
          occurrences: item.occurrences,
          directory_hash: item.directory_hash,
          last_seen: item.last_seen,
        },
      });
    }
  }
  for (const item of cache.buckets.agent_correction.items) {
    if (item.occurrences >= 3 && item.line_ratio >= 0.2) {
      candidates.push({
        signal_kind: 'agent_correction',
        signal_hash: signatureHash('agent_correction', item.agent_id),
        signal_evidence: {
          agent_id_hash: signatureHash('agent_correction', item.agent_id),
          ratio: item.line_ratio,
          occurrences_in_window: item.occurrences,
        },
      });
    }
  }

  for (const cand of candidates) {
    if (ProposalStore.peekSessionCount(sessionId) >= 3) break;
    let out;
    try {
      out = await runAuthorPipeline(cand, transport);
    } catch {
      continue;
    }
    if (out.status !== 'proposal' || !out.artifact) continue;
    const r = await pstore.enqueue({
      projectRoot,
      kind: out.kind,
      signalHash: cand.signal_hash,
      signalKind: cand.signal_kind,
      artifact: out.artifact,
      sessionId,
    });
    if (!r.enqueued && r.reason === 'session_cap') break;
  }
}
