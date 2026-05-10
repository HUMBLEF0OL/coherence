/**
 * Wraps every hook handler. On 3rd exception in a session: writes disabled sentinel (FR-FAILURE-6).
 * RG-4, FR-FAILURE-6
 */
import { Sentinels } from '../state/sentinels.js';

export interface HookResult {
  success: boolean;
  additionalContext?: string;
  /**
   * v0.3 NFR-COMPAT-N4: SessionStart sets this when `refuseLegacy()` rejected
   * pre-v3 state. The hook still returns `success: true` so Claude Code does
   * not surface an error, but the rest of the SessionStart pipeline is
   * skipped. Tests assert this flag rather than parsing console output.
   */
  refusedLegacy?: boolean;
}

const SUCCESS: HookResult = { success: true };

let exceptionCount = 0;

export function resetExceptionCount(): void {
  exceptionCount = 0;
}

export function getExceptionCount(): number {
  return exceptionCount;
}

export async function withExceptionGuard(
  sentinels: Sentinels,
  handler: () => Promise<HookResult>,
): Promise<HookResult> {
  try {
    return await handler();
  } catch (err) {
    exceptionCount++;
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[coherence] hook exception #${exceptionCount}: ${reason}`);

    if (exceptionCount >= 3) {
      sentinels.setAutoDisabled(`${exceptionCount} hook exceptions in session. Last: ${reason}`);
      console.error('[coherence] auto-disabled after 3 hook exceptions (FR-FAILURE-6)');
    }

    return SUCCESS;
  }
}
