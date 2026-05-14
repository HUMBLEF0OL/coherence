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
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs';
import os from 'os';
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

const GITIGNORE_HEADER =
  '# Coherence plugin — per-developer state (do not commit)';
// NFR-PRIVACY-N5 + DD-117: ALL per-developer state under .claude/coherence/
// is private. Earlier versions only ignored signal-cache.json + session-map.json
// individually; that left trust-ledger.json, state-snapshot.json, cost-ledger.json,
// metrics.jsonl, coherence-log.md, scan-cache/, proposal-cache.json, etc.
// committable on `git add .claude/`. The directory-level ignore matches the
// plugin's own repo .gitignore.
const PER_DEV_GITIGNORE_LINES = ['.claude/coherence/'];

export async function runFreshInstall(
  projectRoot: string,
  options: RunFreshInstallOptions = {},
): Promise<void> {
  await initCoherenceDir(projectRoot);

  // M3: ensure per-developer state files are .gitignored. Idempotent.
  patchGitignore(projectRoot);

  // v0.4 TS-3 §1 (DD-120): establish the per-installation CLAUDE_PLUGIN_DATA
  // tier. Claude Code sets CLAUDE_PLUGIN_DATA when executing a plugin's
  // hooks; on dev checkouts (no env var) fall back to an XDG-style path.
  // No files are written here in v0.4 — directory creation only.
  const pluginDataDir =
    process.env['CLAUDE_PLUGIN_DATA'] ??
    path.join(os.homedir(), '.claude', 'plugins', 'data', 'coherence');
  try {
    mkdirSync(pluginDataDir, { recursive: true });
  } catch {
    /* best-effort: a sandboxed shell may forbid writes to ~ */
  }

  // M4: persist telemetry consent (defaults: local ON, upload OFF; non-interactive
  // shells take defaults and re-prompt next interactive session).
  const store = makeStateStore(projectRoot);
  await recordTelemetryConsent(store, {
    ...(options.consent !== undefined ? { decision: options.consent } : {}),
    silent: options.silent ?? false,
  });
}

/** Audit-fix E1: strip a UTF-8 BOM if the file starts with one. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function patchGitignore(projectRoot: string): void {
  const gitignore = path.join(projectRoot, '.gitignore');
  const raw = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  const text = stripBom(raw);
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
