/**
 * Sentinel file helpers for kill-switches.
 * TS-3 §3.1 split rationale:
 *   DISABLED (uppercase) = manual kill-switch, NOT cleared by /coherence:recover
 *   auto-disabled         = auto crash-disable, cleared by /coherence:recover
 *
 * Note: on case-insensitive filesystems (Windows/macOS HFS+), using "disabled"
 * vs "DISABLED" would collide. We use "auto-disabled" for the auto sentinel.
 */
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';

export class Sentinels {
  constructor(private readonly coherenceDir: string) {}

  private get manualPath(): string {
    return path.join(this.coherenceDir, 'DISABLED');
  }

  private get autoPath(): string {
    return path.join(this.coherenceDir, 'auto-disabled');
  }

  isDisabled(): boolean {
    return existsSync(this.manualPath) || existsSync(this.autoPath);
  }

  isManuallyDisabled(): boolean {
    return existsSync(this.manualPath);
  }

  isAutoDisabled(): boolean {
    return existsSync(this.autoPath);
  }

  /** Write auto-disable sentinel with diagnostic body */
  setAutoDisabled(reason: string): void {
    const body = `Coherence auto-disabled at ${new Date().toISOString()}\nReason: ${reason}\n`;
    try {
      writeFileSync(this.autoPath, body, 'utf8');
    } catch {
      // best-effort
    }
  }

  /** Clear only the auto-disable sentinel (used by /coherence:recover) */
  clearAutoDisabled(): void {
    try {
      unlinkSync(this.autoPath);
    } catch {
      // already gone
    }
  }
}
