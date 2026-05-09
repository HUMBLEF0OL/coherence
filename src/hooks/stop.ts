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
