/**
 * v0.4 M4 — slash-command sentinel dispatch (DD-130, FR-AUTOGEN-1).
 *
 * UserPromptSubmit invokes this when it sees the
 * `<!-- coherence-command: <name> -->` sentinel emitted by an autogen stub.
 * Returns a HookResult (with `additionalContext` carrying the command
 * output) when the command is handled, or `null` to delegate to the
 * rest of the UserPromptSubmit pipeline.
 */
import type { StateStore } from '../state/stateStore.js';
import type { HookResult } from './exceptionGuard.js';
import { runConsent, type ConsentOptions } from '../commands/consent.js';
import { runAudit } from '../commands/audit.js';
import { runTrust } from '../commands/trust.js';
import { runMetrics } from '../commands/metrics.js';
import { runRepair, formatRepair, type RepairOptions } from '../commands/repair.js';
import { getCoherenceDir } from '../state/init.js';

function parseConsentArgs(rawPrompt: string): ConsentOptions {
  const opts: ConsentOptions = {};
  if (/--local\s+on/i.test(rawPrompt)) opts.local = 'on';
  if (/--local\s+off/i.test(rawPrompt)) opts.local = 'off';
  if (/--upload\s+on/i.test(rawPrompt)) opts.upload = 'on';
  if (/--upload\s+off/i.test(rawPrompt)) opts.upload = 'off';
  if (/--reset\b/i.test(rawPrompt)) opts.reset = true;
  return opts;
}

/**
 * Split a slash-command tail into argv tokens. v1.0 dispatch is simple — we
 * only need to recover space-separated flags + values from the raw prompt.
 */
function parseArgv(rawPrompt: string, commandName: string): string[] {
  const re = new RegExp(`/${commandName}\\b\\s*`);
  const m = re.exec(rawPrompt);
  if (!m) return [];
  const tail = rawPrompt.slice(m.index + m[0].length).trim();
  if (tail.length === 0) return [];
  // First line only (slash commands don't multi-line)
  const firstLine = tail.split('\n')[0].trim();
  return firstLine.split(/\s+/).filter((t) => t.length > 0);
}

export async function dispatchCoherenceCommand(
  name: string,
  rawPrompt: string,
  store: StateStore,
  projectRoot: string,
  sessionId: string,
): Promise<HookResult | null> {
  const local = name.replace(/^coherence:/, '');
  switch (local) {
    case 'consent': {
      const result = await runConsent(projectRoot, parseConsentArgs(rawPrompt));
      return { success: true, additionalContext: result };
    }
    case 'audit': {
      const argv = parseArgv(rawPrompt, 'coherence:audit');
      const result = await runAudit(projectRoot, { argv, store, sessionId });
      return { success: true, additionalContext: result };
    }
    case 'trust': {
      const argv = parseArgv(rawPrompt, 'coherence:trust');
      const result = await runTrust({ store, projectRoot, argv, sessionId });
      return { success: true, additionalContext: result };
    }
    case 'metrics': {
      const argv = parseArgv(rawPrompt, 'coherence:metrics');
      const result = await runMetrics({ store, projectRoot, argv, sessionId });
      return { success: true, additionalContext: result };
    }
    case 'repair': {
      const argv = parseArgv(rawPrompt, 'coherence:repair');
      const opts: RepairOptions = {};
      const reIdx = argv.indexOf('--reassociate');
      const toIdx = argv.indexOf('--to');
      const hasReassociate = reIdx !== -1 && reIdx < argv.length - 1;
      const hasTo = toIdx !== -1 && toIdx < argv.length - 1;
      if (hasReassociate && !hasTo) throw new Error('coherence: --reassociate requires --to <newRef>');
      if (hasTo && !hasReassociate) throw new Error('coherence: --to requires --reassociate <oldRef>');
      if (hasReassociate && hasTo) opts.reassociate = { from: argv[reIdx + 1], to: argv[toIdx + 1] };
      if (argv.includes('--expire-orphans') || argv.includes('--auto-expire')) opts.expireOrphans = true;
      const result = await runRepair(store, getCoherenceDir(projectRoot), projectRoot, opts);
      return { success: true, additionalContext: formatRepair(result) };
    }
    default:
      return null;
  }
}
