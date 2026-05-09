/**
 * UserPromptSubmit hook — stub for M2. Mid-session refresh added in M5.
 * TS-4 §4.4, FR-MIDSESSION-4 (must never block)
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir } from '../state/init.js';

const SUCCESS: HookResult = { success: true };

export async function userPromptSubmitHook(
  event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    if (sentinels.isDisabled()) return SUCCESS;
    void event;
    return SUCCESS;
  });
}
