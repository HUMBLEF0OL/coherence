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

    return SUCCESS;
  });
}
