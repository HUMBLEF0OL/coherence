/**
 * ID-6: Claude Code stub harness.
 * Simulates hook events, exposes additionalContext, and supports
 * host-capability variants + host-version pinning.
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, cpSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for harness extensibility
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface StubHostCapabilities {
  subagent_attribution?: boolean;
  frontmatter_preserves_unknown_keys?: boolean;
  token_count_in_posttooluse?: boolean;
  host_version?: string;
}

export interface HookCallResult {
  success: boolean;
  additionalContext?: string;
  error?: string;
}

export class ClaudeCodeStub {
  public projectRoot: string;
  public sessionId: string;
  private hostCapabilities: StubHostCapabilities;
  private _destroyed = false;

  constructor(
    opts: {
      fixtureDir?: string;
      capabilities?: StubHostCapabilities;
      sessionId?: string;
    } = {},
  ) {
    this.projectRoot = mkdtempSync(path.join(os.tmpdir(), 'coherence-e2e-'));
    this.sessionId = opts.sessionId ?? `stub-${Date.now()}`;
    this.hostCapabilities = {
      subagent_attribution: false,
      frontmatter_preserves_unknown_keys: true,
      token_count_in_posttooluse: false,
      host_version: 'stub-v2.0',
      ...opts.capabilities,
    };

    // Copy fixture if provided
    if (opts.fixtureDir && existsSync(opts.fixtureDir)) {
      cpSync(opts.fixtureDir, this.projectRoot, { recursive: true });
    }

    // Ensure coherence dir exists
    mkdirSync(path.join(this.projectRoot, '.claude', 'coherence', 'quarantine'), { recursive: true });
  }

  /** Emit a SessionStart event */
  async sessionStart(): Promise<HookCallResult> {
    const { sessionStartHook } = await import('../../../src/hooks/sessionStart.js');
    try {
      const result = await sessionStartHook(
        { session_id: this.sessionId },
        this.projectRoot,
      );
      return { success: result.success, additionalContext: result.additionalContext };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /** Emit a PostToolUse event for a file write */
  async postToolUse(filePath: string): Promise<HookCallResult> {
    const { postToolUseHook } = await import('../../../src/hooks/postToolUse.js');
    try {
      const result = await postToolUseHook(
        { tool: 'write_file', path: filePath },
        this.projectRoot,
      );
      return { success: result.success, additionalContext: result.additionalContext };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /** Emit a Stop event (runs the full pipeline) */
  async stop(): Promise<HookCallResult> {
    const { stopHook } = await import('../../../src/hooks/stop.js');
    try {
      const result = await stopHook(
        { session_id: this.sessionId },
        this.projectRoot,
      );
      return { success: result.success, additionalContext: result.additionalContext };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /** Create a doc file in the project root with coherence sections */
  createDocFile(relativePath: string, content: string): string {
    const fullPath = path.join(this.projectRoot, relativePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');
    return fullPath;
  }

  /** Write to .claude/coherence/<filename> */
  writeCoherenceFile(filename: string, content: string): void {
    const coherenceDir = path.join(this.projectRoot, '.claude', 'coherence');
    writeFileSync(path.join(coherenceDir, filename), content, 'utf8');
  }

  /** Get the .claude/coherence directory path */
  get coherenceDir(): string {
    return path.join(this.projectRoot, '.claude', 'coherence');
  }

  /** Make a StateStore for this stub's coherence dir */
  async makeStore() {
    const { StateStore } = await import('../../../src/state/stateStore.js');
    return new StateStore(this.coherenceDir, path.join(this.coherenceDir, 'quarantine'));
  }

  /** Change host version (simulates upgrade detection) */
  setHostVersion(version: string): void {
    this.hostCapabilities = { ...this.hostCapabilities, host_version: version };
  }

  /** Destroy temp dir */
  destroy(): void {
    if (!this._destroyed) {
      this._destroyed = true;
      try {
        rmSync(this.projectRoot, { recursive: true, force: true });
      } catch { /* best-effort */ }
    }
  }
}
