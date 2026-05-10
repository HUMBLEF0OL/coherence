/**
 * v0.3 first-run sentinel writer (skeleton).
 *
 * Called by SessionStart when `refuseLegacy()` returns `{ status: 'fresh' }`.
 * Lays the `.claude/coherence/` skeleton including the v3 schema sentinel via
 * `initCoherenceDir`. Idempotent: re-invocation on an already-initialised
 * project is a no-op (handled by `initCoherenceDir`'s "create if missing"
 * guards).
 *
 * Extension points (filled in later milestones, not M0):
 *   - M3 (cross-team plan store): `.gitignore` patcher to ignore
 *     `.claude/coherence/proposals/` and other plugin-local paths.
 *   - M4 (metrics export + first-run consent): one-time consent prompt prior
 *     to enabling `metrics.jsonl` writes.
 */
import { initCoherenceDir } from './init.js';

export async function runFreshInstall(projectRoot: string): Promise<void> {
  await initCoherenceDir(projectRoot);
  // M3 — gitignore patcher hooks here.
  // M4 — consent prompt hooks here.
}
