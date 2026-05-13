/**
 * v1.0.1 Fix 10 — auth-availability detection for the live-transport gates.
 *
 * Background: pre-v1.0.1, `pickAuthorTransport` (in `stop.ts` and
 * `sessionEnd.ts`) and `pickPlannerTransport` (in `authorPlanner.ts`)
 * defaulted to the live transport iff `ANTHROPIC_API_KEY` was set in
 * `process.env`, otherwise to a mock. The Fix 9 / Path C migration to
 * the Claude Agent SDK means the LLM transport now also accepts
 * subscription auth (the `claude` CLI's existing session). With the
 * old gate, subscription users would silently fall back to mock
 * author/planner calls — a regression.
 *
 * This module exposes `detectLiveAuthAvailable()` — true when either:
 *   - `ANTHROPIC_API_KEY` is set in the environment, OR
 *   - the `claude` CLI is detectable on PATH (the agent SDK's transport
 *     uses it for subscription auth).
 *
 * The CLI probe is memoized for the lifetime of the process. Hooks
 * fire on every event, so a non-memoized probe would pay a
 * `spawnSync` cost per invocation; the probe is cheap (`claude
 * --version`) but unnecessary on every hot path.
 */
import { spawnSync } from 'child_process';

let _cliAvailable: boolean | null = null;

/**
 * Reset the memoized CLI probe — exposed for tests so each fixture
 * exercises a fresh detection.
 */
export function _resetAuthDetectCache(): void {
  _cliAvailable = null;
}

/**
 * Best-effort: is the `claude` CLI present and runnable on PATH?
 * Memoized after the first call.
 */
function isClaudeCliAvailable(): boolean {
  if (_cliAvailable !== null) return _cliAvailable;
  try {
    const r = spawnSync('claude', ['--version'], {
      stdio: 'pipe',
      timeout: 5_000,
      shell: process.platform === 'win32',
    });
    _cliAvailable = r.status === 0;
  } catch {
    _cliAvailable = false;
  }
  return _cliAvailable;
}

/**
 * Returns true when the live LLM transport has a realistic chance of
 * succeeding without further user setup. False indicates a confident
 * "fall back to mock" — neither auth source is reachable.
 *
 * @param env - optional environment-variable map (defaults to `process.env`).
 *              Tests pass a synthetic map to exercise specific paths.
 * @param cliProbe - optional dependency-inject for the CLI probe; defaults
 *                   to the real `claude --version` spawn. Tests pass a
 *                   pure function so they don't depend on the developer's
 *                   machine having `claude` installed.
 */
export function detectLiveAuthAvailable(
  env: NodeJS.ProcessEnv = process.env,
  cliProbe: () => boolean = isClaudeCliAvailable,
): boolean {
  // Fast path: explicit API key in env. We don't validate it — the SDK
  // will surface auth failures at call time. This matches the v1.0.0
  // semantics for API-key users.
  if (env['ANTHROPIC_API_KEY']) return true;

  // Subscription path: `claude` CLI is the agent SDK's auth source.
  // Its presence on PATH is the cheapest proxy for "subscription auth
  // is configured" without parsing private credential files.
  return cliProbe();
}
