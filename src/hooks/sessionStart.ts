/**
 * SessionStart hook — stub for M2. Full pipeline implemented in M4.
 * TS-4 §4.2
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir } from '../state/init.js';

const SUCCESS: HookResult = { success: true };

export async function sessionStartHook(
  _event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    // Universal first step: kill-switch check (TS-4 §4.1)
    if (sentinels.isDisabled()) return SUCCESS;

    // M4 will fill in the full SessionStart sequence
    return SUCCESS;
  });
}
