/**
 * /coherence:audit — free-tier bundling report (v0.4) and `--deep` LLM
 * cross-section consistency pass (v1.0 M3, DD-125, FR-AUDIT-*).
 *
 * Free tier: doctor + scope-debug + status + metrics export + v1.0 token
 * budget. Deep tier: requires flag-based confirmation (`--confirm-deep <sig>`
 * or `--no-confirm` in CI) and consumes 1 LLM call per pair.
 */
import path from 'path';
import { runDoctor, formatDoctor } from './doctor.js';
import { runScopeDebug, formatScopeDebug } from './scopeDebug.js';
import { runStatus, formatStatus } from './status.js';
import { runExportMetrics, formatExportMetrics } from './exportMetrics.js';
import { makeStateStore, getCoherenceDir, initCoherenceDir } from '../state/init.js';
import type { StateStore } from '../state/stateStore.js';
import { tokenBudgetReport } from '../audit/tokenBudget.js';
import { handleDeepAudit } from '../audit/deepConsistency.js';

export interface RunAuditArgs {
  argv?: string[];
  store?: StateStore;
  sessionId?: string;
}

export async function runAudit(projectRoot: string, args: RunAuditArgs = {}): Promise<string> {
  const argv = args.argv ?? [];
  if (argv.includes('--deep')) {
    const store = args.store ?? makeStateStore(projectRoot);
    return handleDeepAudit({
      store,
      projectRoot,
      argv,
      sessionId: args.sessionId ?? `audit-${Date.now()}`,
    });
  }
  // Make sure the coherence skeleton exists so the bundling sub-commands have
  // something to read. initCoherenceDir is idempotent.
  try {
    await initCoherenceDir(projectRoot);
  } catch {
    /* best-effort: callers may pass an unwritable projectRoot in tests */
  }

  const store = makeStateStore(projectRoot);
  const coherenceDir = getCoherenceDir(projectRoot);
  const sessionId = `audit-${Date.now()}`;

  const header = [
    '# /coherence:audit',
    '> Free tier: bundling-only summary + section token budget. Run with `--deep` for cross-section LLM consistency (v1.0).',
    '',
  ];

  const handlers: Array<[string, () => Promise<string>]> = [
    [
      'Doctor',
      async (): Promise<string> => formatDoctor(await runDoctor(store, { projectRoot })),
    ],
    [
      'Scope Debug',
      async (): Promise<string> =>
        formatScopeDebug(
          await runScopeDebug({ store, projectRoot, filePath: '.', sessionId }),
        ),
    ],
    [
      'Status',
      async (): Promise<string> => formatStatus(await runStatus(store, coherenceDir)),
    ],
    [
      'Metrics Export',
      async (): Promise<string> =>
        formatExportMetrics(
          await runExportMetrics({
            store,
            projectRoot,
            sessionId,
            out: path.join(projectRoot, '.claude', 'coherence', 'audit-metrics.jsonl'),
          }),
        ),
    ],
    [
      'Section Token Budget',
      (): Promise<string> => Promise.resolve(tokenBudgetReport(projectRoot)),
    ],
  ];

  const results: string[] = [];
  for (const [label, fn] of handlers) {
    results.push(`## ${label}`);
    try {
      results.push(await fn());
    } catch (e) {
      results.push(`[error: ${String(e)}]`);
    }
    results.push('');
  }

  return [...header, ...results].join('\n');
}
