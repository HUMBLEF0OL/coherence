/**
 * Quarantine manager — retains last 10 backups per file.
 * NFR-RELIABILITY-7: quarantine/<filename>.<unix-ts>.bak
 */
import { mkdirSync, readdirSync, renameSync, statSync, unlinkSync, existsSync } from 'fs';
import path from 'path';

const MAX_BACKUPS_PER_FILE = 10;

export function quarantineFile(filePath: string, quarantineDir: string): void {
  mkdirSync(quarantineDir, { recursive: true });

  const ts = Date.now();
  const basename = path.basename(filePath);
  const bakName = `${basename}.${ts}.bak`;
  const bakPath = path.join(quarantineDir, bakName);

  if (existsSync(filePath)) {
    try {
      renameSync(filePath, bakPath);
    } catch {
      // File may have been moved by another process; ignore
    }
  }

  pruneQuarantine(basename, quarantineDir);
}

function pruneQuarantine(basename: string, quarantineDir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(quarantineDir);
  } catch {
    return;
  }

  const matching = entries
    .filter((e) => e.startsWith(`${basename}.`) && e.endsWith('.bak'))
    .map((e) => {
      try {
        return { name: e, mtime: statSync(path.join(quarantineDir, e)).mtimeMs };
      } catch {
        return { name: e, mtime: 0 };
      }
    })
    .sort((a, b) => a.mtime - b.mtime); // oldest first

  while (matching.length > MAX_BACKUPS_PER_FILE) {
    const oldest = matching.shift()!;
    try {
      unlinkSync(path.join(quarantineDir, oldest.name));
    } catch {
      // best-effort
    }
  }
}
