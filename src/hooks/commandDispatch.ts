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

function parseConsentArgs(rawPrompt: string): ConsentOptions {
  const opts: ConsentOptions = {};
  if (/--local\s+on/i.test(rawPrompt)) opts.local = 'on';
  if (/--local\s+off/i.test(rawPrompt)) opts.local = 'off';
  if (/--upload\s+on/i.test(rawPrompt)) opts.upload = 'on';
  if (/--upload\s+off/i.test(rawPrompt)) opts.upload = 'off';
  if (/--reset\b/i.test(rawPrompt)) opts.reset = true;
  return opts;
}

export async function dispatchCoherenceCommand(
  name: string,
  rawPrompt: string,
  _store: StateStore,
  projectRoot: string,
  _sessionId: string,
): Promise<HookResult | null> {
  const local = name.replace(/^coherence:/, '');
  switch (local) {
    case 'consent': {
      const result = await runConsent(projectRoot, parseConsentArgs(rawPrompt));
      return { success: true, additionalContext: result };
    }
    case 'audit': {
      const result = await runAudit(projectRoot);
      return { success: true, additionalContext: result };
    }
    default:
      return null;
  }
}
