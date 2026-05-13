/**
 * v1.0.2 — shared hook-wrapper runtime.
 *
 * Each hook in `hooks/hooks.json` invokes a per-hook wrapper script under
 * this directory. Those wrappers all do the same thing: read the JSON event
 * payload from stdin, resolve the project root from the env (or cwd as a
 * fallback), call the compiled handler from `../../dist/hooks/<name>.js`,
 * and emit any `additionalContext` to stdout.
 *
 * The exit-code contract follows Claude Code's hook protocol:
 *   - 0  -> success; stdout is captured as additionalContext.
 *   - !0 -> hook failure; stderr is surfaced to the user.
 *
 * The handler itself never throws unprotected — `withExceptionGuard` in
 * `src/hooks/exceptionGuard.ts` catches and translates to a `HookResult`.
 * This wrapper translates that result to the exit-code protocol.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export async function runHook(handlerName, handlerExportName) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(here, '..', '..', 'dist', 'hooks', `${handlerName}.js`);
  const mod = await import(pathToFileURL(distPath).href);
  const handler = mod[handlerExportName];
  if (typeof handler !== 'function') {
    process.stderr.write(`[coherence hook] missing export '${handlerExportName}' in ${distPath}\n`);
    process.exit(1);
  }

  let stdinData = '';
  for await (const chunk of process.stdin) stdinData += chunk;
  let event = {};
  if (stdinData.trim().length > 0) {
    try { event = JSON.parse(stdinData); } catch (err) {
      process.stderr.write(`[coherence hook ${handlerName}] non-JSON stdin: ${err.message}\n`);
      // Fall through with empty event — handler will degrade gracefully.
    }
  }

  const projectRoot = process.env.CLAUDE_PROJECT_DIR
    || event.cwd
    || event.project_root
    || process.cwd();

  let result;
  try {
    result = await handler(event, projectRoot);
  } catch (err) {
    process.stderr.write(`[coherence hook ${handlerName}] uncaught: ${err?.message ?? err}\n`);
    process.exit(1);
  }

  if (result?.additionalContext) {
    process.stdout.write(String(result.additionalContext));
  }
  process.exit(result?.success === false ? 1 : 0);
}
