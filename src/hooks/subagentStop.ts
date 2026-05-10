/**
 * SubagentStop hook — provenance capture + stats + classifier window.
 * TS-4 §4.5
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, makeStateStore } from '../state/init.js';
import { captureProvenance } from '../subagent/tracker.js';
import { addClassification } from '../subagent/stats.js';
import type { HostCapabilities, SubagentStats } from '../types/index.js';
import { emitAgentResponseId } from '../signal/telemetry.js';
import { appendCorrection, readSignalCache, writeSignalCache } from '../signal/signalCache.js';

const SUCCESS: HookResult = { success: true };

const DEFAULT_CAPABILITIES: HostCapabilities = {
  subagent_attribution: false,
  frontmatter_preserves_unknown_keys: false,
  hook_event_shapes: {},
  token_count_in_posttooluse: false,
};

export async function subagentStopHook(
  event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    if (sentinels.isDisabled()) return SUCCESS;

    const store = makeStateStore(projectRoot);

    // Load host capabilities
    const capabilities = (await store.read<HostCapabilities>('host-capabilities.json')) ?? DEFAULT_CAPABILITIES;

    // Capture provenance
    const attribution = captureProvenance(event, capabilities);

    // Append to subagent-history.jsonl
    await store.appendJsonl('subagent-history.jsonl', attribution);

    // Update rolling stats
    const stats = (await store.read<SubagentStats>('subagent-stats.json')) ?? {
      window_size: 0,
      accepted: 0,
      edited: 0,
      discarded: 0,
      rejected: 0,
    };
    const updated = addClassification(stats, attribution.classification);
    await store.write('subagent-stats.json', updated);

    // N2 fix: emit DD-068 agent_response_id telemetry.
    const evt = event as { session_id?: string; agent_id?: string; response_lines?: number };
    const sessionId = evt.session_id ?? attribution.session_id ?? `session-${Date.now()}`;
    const agentId = evt.agent_id ?? attribution.invocation_id;
    const responseLines = typeof evt.response_lines === 'number' ? evt.response_lines : 0;
    try {
      await emitAgentResponseId(store, sessionId, { agentId, responseLines });
    } catch {
      /* telemetry non-fatal */
    }

    // A4 fix: feed agent-correction signal-cache from observed corrections.
    // SubagentAttribution exposes `lines_added` + `lines_removed`; the host
    // event's `response_lines` (when present) is the denominator.
    if (
      attribution.classification === 'edited' ||
      attribution.classification === 'discarded'
    ) {
      try {
        const linesChanged =
          (attribution.lines_added ?? 0) + (attribution.lines_removed ?? 0);
        const totalLines = responseLines > 0 ? responseLines : linesChanged;
        const ratio = totalLines === 0 ? 0 : linesChanged / totalLines;
        const cache = await readSignalCache(store);
        const next = appendCorrection(cache, agentId, ratio, new Date().toISOString());
        await writeSignalCache(store, next);
      } catch {
        /* signal append non-fatal */
      }
    }

    return SUCCESS;
  });
}
