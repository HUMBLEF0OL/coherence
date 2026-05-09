/**
 * Sentinel file helpers for kill-switches.
 * TS-3 §3.1 split rationale:
 *   DISABLED (uppercase) = manual kill-switch, NOT cleared by /coherence:recover
 *   disabled (lowercase) = auto crash-disable, cleared by /coherence:recover
 */
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';

export class Sentinels {
  constructor(private readonly coherenceDir: string) {}

  private get manualPath(): string {
    return path.join(this.coherenceDir, 'DISABLED');
  }

  private get autoPaths(): string[] {
    return [
      path.join(this.coherenceDir, 'disabled'),
      path.join(this.coherenceDir, 'DISABLED'),
    ];
  }

  isDisabled(): boolean {
    return this.autoPaths.some((p) => existsSync(p));
  }

  isManuallyDisabled(): boolean {
    return existsSync(this.manualPath);
  }

  isAutoDisabled(): boolean {
    return existsSync(path.join(this.coherenceDir, 'disabled'));
  }

  /** Write auto-disable sentinel with diagnostic body */
  setAutoDisabled(reason: string): void {
    const p = path.join(this.coherenceDir, 'disabled');
    const body = `Coherence auto-disabled at ${new Date().toISOString()}\nReason: ${reason}\n`;
    try {
      writeFileSync(p, body, 'utf8');
    } catch {
      // best-effort
    }
  }

  /** Clear only the auto-disable sentinel (used by /coherence:recover) */
  clearAutoDisabled(): void {
    try {
      unlinkSync(path.join(this.coherenceDir, 'disabled'));
    } catch {
      // already gone
    }
  }
}
