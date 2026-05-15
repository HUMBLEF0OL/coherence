#!/usr/bin/env node
/**
 * Generic CLI dispatcher for /coherence:* slash command bodies (v1.1.0
 * Phase 2 — closes the M4 body-pattern gap).
 *
 * Each slash command's body in `commands/<name>.md` invokes
 * `node "${CLAUDE_PLUGIN_ROOT}/bin/cli.mjs" <name> [args...]`. The shim
 * at `bin/cli.mjs` imports `runCli` from the compiled `dist/cli.js` and
 * delegates here. This file dispatches to the matching handler in
 * `src/commands/` and prints its rendered output.
 *
 * The four wired commands cover everything Phase 2 introduced or
 * consolidated:
 *
 *   - `feedback <free text>`     → captureFeedbackBundle (S6)
 *   - `propose <subcommand>...`  → routePropose + propose handler (C3)
 *   - `plan <subcommand>...`     → routePlan + plan handler (C3)
 *   - `statusline <subcommand>`  → routeStatusline + install/uninstall (C3)
 *
 * Pre-existing flat commands (trust/audit/repair/metrics/consent, etc.)
 * stay non-functional at the slash surface until a follow-up — this
 * shim is the foundation they will also use.
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { makeStateStore } from './state/init.js';
import { captureFeedbackBundle } from './commands/feedback.js';
import { routePropose } from './commands/proposeRouter.js';
import { routePlan } from './commands/planRouter.js';
import { routeStatusline } from './commands/statuslineRouter.js';
import { runProposeList } from './commands/proposeList.js';
import { runProposeShow } from './commands/proposeShow.js';
import { runProposeAccept } from './commands/proposeAccept.js';
import { runProposeReject } from './commands/proposeReject.js';
import { runProposeRevertAcceptance } from './commands/proposeRevertAcceptance.js';
import {
  runPlanCreate,
  parsePlanCreateArgs,
} from './commands/planCreate.js';
import {
  runPlanAccept,
  parsePlanAcceptArgs,
} from './commands/planAccept.js';
import {
  runPlanReject,
  parsePlanRejectArgs,
} from './commands/planReject.js';
import { installStatusline } from './commands/installStatusline.js';
import { uninstallStatusline } from './commands/uninstallStatusline.js';

const SESSION_ID = process.env['CLAUDE_SESSION_ID'] ?? 'cli';

function resolveStatuslineScriptPath(): string {
  // dist/cli.js lives one level under the plugin install root; the
  // shipped statusline script is in `bin/` next to it. Prefer the
  // CLAUDE_PLUGIN_ROOT env when set (Claude Code sets it for hooks);
  // fall back to a path relative to this module so local invocations
  // work in dev checkouts too.
  const pluginRoot =
    process.env['CLAUDE_PLUGIN_ROOT'] ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const scriptName =
    process.platform === 'win32'
      ? 'coherence-statusline.ps1'
      : 'coherence-statusline.sh';
  return path.join(pluginRoot, 'bin', scriptName);
}

async function dispatchPropose(args: string[], projectRoot: string): Promise<string> {
  const route = await routePropose(args);
  if (route.subcommand === 'help') return route.helpText ?? '';
  const store = makeStateStore(projectRoot);
  switch (route.subcommand) {
    case 'list':
      return (await runProposeList(store, { sessionId: SESSION_ID })).rendered;
    case 'show': {
      if (!route.target) throw new Error('propose show: <id> required');
      return (await runProposeShow(store, projectRoot, route.target, SESSION_ID)).rendered;
    }
    case 'accept': {
      if (!route.target) throw new Error('propose accept: <id> required');
      const rename = route.args.includes('--rename');
      const owIdx = route.args.indexOf('--overwrite');
      const overwriteRetypedPath = owIdx >= 0 ? route.args[owIdx + 1] : undefined;
      return (
        await runProposeAccept({
          store,
          projectRoot,
          proposalId: route.target,
          sessionId: SESSION_ID,
          rename,
          ...(overwriteRetypedPath !== undefined ? { overwriteRetypedPath } : {}),
        })
      ).rendered;
    }
    case 'reject': {
      if (!route.target) throw new Error('propose reject: <id> required');
      return (await runProposeReject(store, route.target, SESSION_ID)).rendered;
    }
    case 'revert-acceptance': {
      if (!route.target) {
        throw new Error('propose revert-acceptance: <id> required');
      }
      return (
        await runProposeRevertAcceptance({
          store,
          projectRoot,
          proposalId: route.target,
          sessionId: SESSION_ID,
        })
      ).rendered;
    }
  }
  return '';
}

async function dispatchPlan(args: string[], projectRoot: string): Promise<string> {
  const route = await routePlan(args);
  if (route.subcommand === 'help') return route.helpText ?? '';
  const store = makeStateStore(projectRoot);
  switch (route.subcommand) {
    case 'create': {
      const parsed = parsePlanCreateArgs(route.args);
      return (
        await runPlanCreate({
          store,
          projectRoot,
          sessionId: SESSION_ID,
          ...parsed,
        })
      ).message;
    }
    case 'accept': {
      const parsed = parsePlanAcceptArgs(route.args);
      return (
        await runPlanAccept({
          store,
          projectRoot,
          sessionId: SESSION_ID,
          ...parsed,
        })
      ).message;
    }
    case 'reject': {
      const parsed = parsePlanRejectArgs(route.args);
      return (
        await runPlanReject({
          store,
          projectRoot,
          sessionId: SESSION_ID,
          ...parsed,
        })
      ).message;
    }
  }
  return '';
}

async function dispatchStatusline(args: string[]): Promise<string> {
  const route = await routeStatusline(args);
  if (route.subcommand === 'help') return route.helpText ?? '';
  switch (route.subcommand) {
    case 'install': {
      const r = installStatusline({
        confirm: true,
        statuslineScriptPath: resolveStatuslineScriptPath(),
      });
      return r.installed
        ? `[coherence] statusline install: installed${r.backupPath ? ` (backup: ${r.backupPath})` : ''}`
        : `[coherence] statusline install: skipped (${r.reason ?? 'unknown'})`;
    }
    case 'uninstall': {
      const r = uninstallStatusline({});
      return r.uninstalled
        ? `[coherence] statusline uninstall: restored${r.restoredFromBackup ? ` from ${r.restoredFromBackup}` : ''}`
        : `[coherence] statusline uninstall: skipped (${r.reason ?? 'unknown'})`;
    }
  }
  return '';
}

export async function runCli(argv: string[]): Promise<string> {
  const [command, ...args] = argv;
  if (!command) {
    return 'Usage: node dist/cli.js <command> [args...]';
  }
  const projectRoot = process.cwd();
  switch (command) {
    case 'feedback': {
      const bundle = await captureFeedbackBundle({
        projectRoot,
        userMessage: args.join(' '),
      });
      return JSON.stringify(bundle, null, 2);
    }
    case 'propose':
      return dispatchPropose(args, projectRoot);
    case 'plan':
      return dispatchPlan(args, projectRoot);
    case 'statusline':
      return dispatchStatusline(args);
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

// Entrypoint guard: only run when invoked as a script, not when imported
// from tests. Use `pathToFileURL` so Windows paths with spaces (which the
// platform percent-encodes in `import.meta.url`) match correctly.
const invokedAsScript =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedAsScript) {
  runCli(process.argv.slice(2))
    .then((out) => {
      if (out.length > 0) console.log(out);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
