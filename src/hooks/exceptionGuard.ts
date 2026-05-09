/**
 * Wraps every hook handler. On 3rd exception in a session: writes disabled sentinel (FR-FAILURE-6).
 * RG-4, FR-FAILURE-6
 */
import { Sentinels } from '../state/sentinels.js';

export interface HookResult {
  success: boolean;
  additionalContext?: string;
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
