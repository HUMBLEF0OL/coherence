/**
 * UserPromptSubmit hook — long-turn boundary detection + conversational mention.
 * TS-4 §4.4, FR-MIDSESSION-2/3/4 (never blocks)
 * All three FR-MIDSESSION-3 conditions must hold simultaneously:
 *   (a) buffer has ≥3 distinct trigger groups
 *   (b) ≥15 min since last Stop or /coherence:review
 *   (c) post-long-agent-turn boundary just crossed
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, makeStateStore } from '../state/init.js';
import { BufferLifecycle } from '../buffer/lifecycle.js';
import type { DriftBuffer } from '../buffer/lifecycle.js';

const SUCCESS: HookResult = { success: true };
const LONG_TURN_SILENCE_MS = 5 * 60 * 1000; // 5 min user silence
const MIN_SINCE_LAST_STOP_MS = 15 * 60 * 1000; // 15 min
const MIN_TRIGGER_GROUPS = 3;

let lastUserPromptTime = Date.now();
let lastStopOrReviewTime = 0;
let toolCallCount = 0;

export function recordToolCall(): void {
  toolCallCount++;
}

export function recordStopOrReview(): void {
  lastStopOrReviewTime = Date.now();
}

function countDistinctTriggerGroups(buf: DriftBuffer): number {
  const paths = new Set(buf.entries.map((e) => e.path));
  return paths.size;
}

function isLongTurnBoundary(): boolean {
  const silenceMs = Date.now() - lastUserPromptTime;
  return silenceMs >= LONG_TURN_SILENCE_MS || toolCallCount >= 5;
}

export async function userPromptSubmitHook(
  _event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    if (sentinels.isDisabled()) return SUCCESS;

    const store = makeStateStore(projectRoot);
    const buffer = new BufferLifecycle(store);
    const buf = await buffer.read();

    const distinctGroups = countDistinctTriggerGroups(buf);
    const msSinceLastStop = Date.now() - lastStopOrReviewTime;
    const longTurn = isLongTurnBoundary();

    // Reset counters
    lastUserPromptTime = Date.now();
    toolCallCount = 0;

    // Check all three FR-MIDSESSION-3 conditions
    if (
      distinctGroups >= MIN_TRIGGER_GROUPS &&
      msSinceLastStop >= MIN_SINCE_LAST_STOP_MS &&
      longTurn
    ) {
      // Inject conversational mention via additionalContext (DD-012 Mechanism 2)
      return {
        success: true,
        additionalContext: `[coherence] ${distinctGroups} documentation sections have pending drift. Consider running /coherence:review.`,
      };
    }

    return SUCCESS;
  });
}
