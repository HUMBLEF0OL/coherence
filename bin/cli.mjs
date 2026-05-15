#!/usr/bin/env node
/**
 * v1.1.0 Phase 2 — generic slash command dispatcher shim.
 *
 * Each `commands/<name>.md` body invokes
 * `node "${CLAUDE_PLUGIN_ROOT}/bin/cli.mjs" <command> [args...]`. This
 * shim is the slash-surface analogue of `bin/hooks/_runHook.mjs`: it
 * lives in the git-tracked `bin/` tree, resolves the compiled
 * `dist/cli.js`, and delegates to its `runCli` export.
 *
 * The exit-code contract:
 *   - 0  → success; the rendered output is printed to stdout.
 *   - !0 → the handler threw (e.g. missing required positional, parse
 *          error); the message is written to stderr.
 *
 * Soft refusals (`runProposeAccept` returning `{ accepted: false }`)
 * still exit 0 because the rendered output already carries the
 * actionable remediation — the user / agent reads stdout, not the
 * exit code.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(here, '..', 'dist', 'cli.js');
const mod = await import(pathToFileURL(distPath).href);

if (typeof mod.runCli !== 'function') {
  process.stderr.write(
    `[coherence cli] missing export 'runCli' in ${distPath}\n`,
  );
  process.exit(1);
}

try {
  const out = await mod.runCli(process.argv.slice(2));
  if (out && out.length > 0) process.stdout.write(out + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(
    (err instanceof Error ? err.message : String(err)) + '\n',
  );
  process.exit(1);
}
