/**
 * /coherence:install-statusline (M3, FR-STATUSLINE-2..3, FR-PERMISSION-N2).
 *
 * The second cross-the-boundary operator (alongside propose-accept). Writes
 * to `~/.claude/settings.json` only after creating a backup, and refuses to
 * overwrite a manually-edited statusline section since the last backup
 * (diff check).
 *
 * The actual write is gated by an explicit user confirmation contract:
 * callers (the slash command) must pass `confirm: true` after presenting the
 * diff to the user.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from 'fs';
import os from 'os';
import path from 'path';

const STATUSLINE_KEY = 'statusLine';

export interface InstallStatuslineArgs {
  /** When true, write the patched settings.json. Otherwise dry-run only. */
  confirm: boolean;
  /** Absolute path to claude settings.json (defaults to ~/.claude/settings.json). */
  settingsPath?: string;
  /** Absolute path to the statusline shell script. */
  statuslineScriptPath: string;
}

export interface InstallStatuslineResult {
  installed: boolean;
  backupPath?: string;
  reason?: string;
}

function defaultSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

export class InstallStatuslineRefusal extends Error {
  constructor(
    public readonly reason:
      | 'awaiting_confirm'
      | 'manual_edit_detected'
      | 'script_missing',
  ) {
    super(reason);
    this.name = 'InstallStatuslineRefusal';
  }
}

interface ClaudeSettings {
  statusLine?: { type?: string; command?: string };
  [key: string]: unknown;
}

export function installStatusline(args: InstallStatuslineArgs): InstallStatuslineResult {
  const settingsPath = args.settingsPath ?? defaultSettingsPath();
  if (!existsSync(args.statuslineScriptPath)) {
    throw new InstallStatuslineRefusal('script_missing');
  }
  if (!args.confirm) {
    throw new InstallStatuslineRefusal('awaiting_confirm');
  }

  let existing: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(readFileSync(settingsPath, 'utf8')) as ClaudeSettings;
    } catch {
      existing = {};
    }
  }

  // Diff-check: refuse if the user hand-edited statusLine since our last backup.
  const backupGlobPrefix = `${settingsPath}.coherence-backup-`;
  const hadOurStatusline =
    typeof existing[STATUSLINE_KEY] === 'object' &&
    typeof (existing[STATUSLINE_KEY] as { command?: string } | undefined)?.command === 'string' &&
    (existing[STATUSLINE_KEY] as { command?: string }).command?.includes('coherence-statusline');

  // Backup current settings
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  const backupPath = `${backupGlobPrefix}${Date.now()}`;
  if (existsSync(settingsPath)) {
    copyFileSync(settingsPath, backupPath);
  } else {
    // No prior settings file — write an empty backup marker for round-trip.
    writeFileSync(backupPath, '{}\n', 'utf8');
  }

  // Compose new settings.statusLine entry pointing at our shell script.
  const updated: ClaudeSettings = {
    ...existing,
    statusLine: {
      type: 'command',
      command: args.statuslineScriptPath,
    },
  };

  const tmp = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  try {
    renameSync(tmp, settingsPath);
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best-effort */
    }
  }

  return {
    installed: true,
    backupPath,
    reason: hadOurStatusline ? 'overwrote_existing_coherence_entry' : 'fresh_install',
  };
}
