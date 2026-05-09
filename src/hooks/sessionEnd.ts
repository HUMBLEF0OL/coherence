/**
 * SessionEnd hook — buffer persistence, reset session-scoped state.
 * TS-4 §4.7
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, makeStateStore } from '../state/init.js';
import { BufferLifecycle } from '../buffer/lifecycle.js';

const SUCCESS: HookResult = { success: true };

export async function sessionEndHook(
  _event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    if (sentinels.isDisabled()) return SUCCESS;

    const store = makeStateStore(projectRoot);
    const buffer = new BufferLifecycle(store);

    // Persist deferred buffer to pending.md
    const buf = await buffer.read();
    if (buf.state === 'pending' && buf.entries.length > 0) {
      // Defer the buffer (will be picked up at next SessionStart re-validation)
      await buffer.defer();
    }

    // Reset session-scoped cost ledger
    // (Full subagent classification finalize in M5)

    return SUCCESS;
  });
}
