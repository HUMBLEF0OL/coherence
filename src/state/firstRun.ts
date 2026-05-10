/**
 * v0.3 first-run sentinel writer.
 *
 * Called by SessionStart when `refuseLegacy()` returns `{ status: 'fresh' }`.
 * Lays the `.claude/coherence/` skeleton including the v3 schema sentinel via
 * `initCoherenceDir`. Idempotent: re-invocation on an already-initialised
 * project is a no-op (handled by `initCoherenceDir`'s "create if missing"
 * guards).
 *
 * Build-up across milestones (round-2 P4 + C6):
 *   - M0: lay v3 schema sentinel via initCoherenceDir
 *   - M3: append per-developer state to .gitignore (signal-cache, session-map)
 *   - M4: capture first-run telemetry consent (local + upload tiers)
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import path from 'path';
import { initCoherenceDir, makeStateStore } from './init.js';
import { recordTelemetryConsent, type TelemetryConsentDecision } from './consent.js';

export interface RunFreshInstallOptions {
  /**
   * Optional consent override (used in non-interactive shells / test fixtures).
   * When omitted, the M4 consent prompt is invoked interactively.
   */
  consent?: TelemetryConsentDecision;
  /**
   * When true, suppresses any console output. Used by test runs that want to
   * exercise the side-effect path without polluting test output.
   */
  silent?: boolean;
}

const GITIGNORE_HEADER = '# cohrence — per-developer state (do not commit)';
const PER_DEV_GITIGNORE_LINES = [
  '.claude/coherence/signal-cache.json',
  '.claude/coherence/session-map.json',
];

export async function runFreshInstall(
  projectRoot: string,
  options: RunFreshInstallOptions = {},
): Promise<void> {
  await initCoherenceDir(projectRoot);

  // M3: ensure per-developer state files are .gitignored. Idempotent.
  patchGitignore(projectRoot);

  // M4: persist telemetry consent (defaults: local ON, upload OFF; non-interactive
  // shells take defaults and re-prompt next interactive session).
  const store = makeStateStore(projectRoot);
  await recordTelemetryConsent(store, {
    ...(options.consent !== undefined ? { decision: options.consent } : {}),
    silent: options.silent ?? false,
  });
}

function patchGitignore(projectRoot: string): void {
  const gitignore = path.join(projectRoot, '.gitignore');
  const text = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  const present = new Set(
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#')),
  );
  const missing = PER_DEV_GITIGNORE_LINES.filter((l) => !present.has(l));
  if (missing.length === 0) return;

  const prefix = text.length === 0 || text.endsWith('\n') ? '' : '\n';
  const block = `${prefix}${GITIGNORE_HEADER}\n${missing.join('\n')}\n`;
  if (existsSync(gitignore)) {
    appendFileSync(gitignore, block, 'utf8');
  } else {
    writeFileSync(gitignore, block, 'utf8');
  }
}
