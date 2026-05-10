/**
 * /coherence:uninstall-statusline (M3, FR-STATUSLINE-3).
 *
 * Restores the most recent `<settings>.coherence-backup-<ts>` and removes
 * the coherence statusLine entry. Also cross-the-boundary, allow-listed.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  copyFileSync,
  renameSync,
  unlinkSync,
} from 'fs';
import os from 'os';
import path from 'path';

export interface UninstallStatuslineArgs {
  settingsPath?: string;
}

export interface UninstallStatuslineResult {
  uninstalled: boolean;
  restoredFromBackup?: string;
  reason?: string;
}

function defaultSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

export function uninstallStatusline(args: UninstallStatuslineArgs = {}): UninstallStatuslineResult {
  const settingsPath = args.settingsPath ?? defaultSettingsPath();
  const dir = path.dirname(settingsPath);
  const baseName = path.basename(settingsPath);
  let backups: string[] = [];
  try {
    backups = readdirSync(dir)
      .filter((f) => f.startsWith(`${baseName}.coherence-backup-`))
      .sort()
      .reverse();
  } catch {
    backups = [];
  }
  if (backups.length === 0) {
    return { uninstalled: false, reason: 'no_backup_found' };
  }
  const latestBackup = path.join(dir, backups[0]);
  // Restore the backup atomically: copy to a temp then rename.
  const tmp = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  copyFileSync(latestBackup, tmp);
  try {
    renameSync(tmp, settingsPath);
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best-effort */
    }
  }

  // Sanity: parse the restored file to make sure it is JSON-valid.
  try {
    JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    // Backup itself was corrupted — write an empty settings file.
    writeFileSync(settingsPath, '{}\n', 'utf8');
  }

  return { uninstalled: true, restoredFromBackup: latestBackup };
}
