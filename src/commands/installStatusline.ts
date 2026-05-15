/**
 * /coherence:statusline install (M3, FR-STATUSLINE-2..3, FR-PERMISSION-N2; v1.1.0 C3 subcommand surface).
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
  readdirSync,
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

/** Find the most-recent `<settingsPath>.coherence-backup-<ts>` file, or null. */
function findLatestBackup(settingsPath: string): string | null {
  const dir = path.dirname(settingsPath);
  const base = path.basename(settingsPath);
  const prefix = `${base}.coherence-backup-`;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  let bestTs = -1;
  let bestName: string | null = null;
  for (const name of entries) {
    if (!name.startsWith(prefix)) continue;
    const tsRaw = name.slice(prefix.length);
    const ts = Number.parseInt(tsRaw, 10);
    if (!Number.isFinite(ts)) continue;
    if (ts > bestTs) {
      bestTs = ts;
      bestName = name;
    }
  }
  return bestName ? path.join(dir, bestName) : null;
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

  // FR-PERMISSION-N2 diff-check: if the live statusLine entry is a coherence
  // entry but does NOT match the value recorded in our most recent backup,
  // the user (or another tool) has edited it out-of-band. Refuse rather than
  // overwrite their edit. The previous wireshell computed `hadOurStatusline`
  // but never threw, so any drift was silently squashed.
  const backupGlobPrefix = `${settingsPath}.coherence-backup-`;
  const hadOurStatusline =
    typeof existing[STATUSLINE_KEY] === 'object' &&
    typeof (existing[STATUSLINE_KEY] as { command?: string } | undefined)?.command === 'string' &&
    (existing[STATUSLINE_KEY] as { command?: string }).command?.includes('coherence-statusline');

  if (hadOurStatusline) {
    const lastBackup = findLatestBackup(settingsPath);
    if (lastBackup) {
      try {
        const backupRaw = readFileSync(lastBackup, 'utf8');
        const backupParsed = JSON.parse(backupRaw) as ClaudeSettings;
        const live = JSON.stringify(existing[STATUSLINE_KEY] ?? null);
        const recorded = JSON.stringify(backupParsed[STATUSLINE_KEY] ?? null);
        if (live !== recorded) {
          throw new InstallStatuslineRefusal('manual_edit_detected');
        }
      } catch (err) {
        if (err instanceof InstallStatuslineRefusal) throw err;
        // Backup unreadable — fail-closed: treat as manual edit.
        throw new InstallStatuslineRefusal('manual_edit_detected');
      }
    }
  }

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
