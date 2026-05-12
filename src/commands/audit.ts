/**
 * v0.4 M3 — /coherence:audit (DD-125, FR-AUDIT-1).
 *
 * Bundling-only audit report: runs doctor + scope-debug + status + metrics
 * export, captures each result, and renders a single Markdown report. Deep
 * audit ships in v1.0.
 */
import path from 'path';
import { runDoctor, formatDoctor } from './doctor.js';
import { runScopeDebug, formatScopeDebug } from './scopeDebug.js';
import { runStatus, formatStatus } from './status.js';
import { runExportMetrics, formatExportMetrics } from './exportMetrics.js';
import { makeStateStore, getCoherenceDir, initCoherenceDir } from '../state/init.js';

export async function runAudit(projectRoot: string): Promise<string> {
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
    '> v0.4 audit is a bundling-only summary; deep audit ships in v1.0.',
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
