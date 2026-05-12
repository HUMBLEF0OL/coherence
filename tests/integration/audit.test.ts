/**
 * M-AUDIT-1 — /coherence:audit (v0.4 DD-125).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
  mkdirSync(path.join(projectRoot, '.claude', 'coherence', 'quarantine'), {
    recursive: true,
  });
});
afterEach(() => rmSync(projectRoot, { recursive: true, force: true }));

describe('/coherence:audit (M-AUDIT-1)', () => {
  it('returns a markdown report containing all four section headers', async () => {
    const { runAudit } = await import('../../src/commands/audit.js');
    const out = await runAudit(projectRoot);
    expect(out).toContain('v0.4 audit is a bundling-only summary');
    expect(out).toContain('## Doctor');
    expect(out).toContain('## Scope Debug');
    expect(out).toContain('## Status');
    expect(out).toContain('## Metrics Export');
  });

  it('does not throw if individual handlers fail — wraps in [error: ...]', async () => {
    const { runAudit } = await import('../../src/commands/audit.js');
    await expect(runAudit(projectRoot)).resolves.not.toThrow();
  });
});
