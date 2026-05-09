/**
 * E2E-9: Kill-switch end-to-end.
 * DISABLED and auto-disabled sentinel behaviour.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, existsSync } from 'fs';
import path from 'path';
import { ClaudeCodeStub } from './harness/claudeCodeStub.js';
import { Sentinels } from '../../src/state/sentinels.js';

let stub: ClaudeCodeStub;

beforeEach(() => {
  stub = new ClaudeCodeStub();
});

afterEach(() => {
  stub.destroy();
});

describe('E2E-9: kill-switch', () => {
  it('DISABLED sentinel prevents PostToolUse from adding buffer entries', async () => {
    // Write DISABLED sentinel
    writeFileSync(path.join(stub.coherenceDir, 'DISABLED'), 'manual\n');

    const filePath = stub.createDocFile('docs/api.md', [
      '<!-- coherence:section id="intro" -->',
      '# API',
      '',
      'Content.',
    ].join('\n'));

    await stub.postToolUse(filePath);

    const store = await stub.makeStore();
    const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');
    // Buffer should be empty because kill-switch is active
    expect(buf?.entries.length ?? 0).toBe(0);
  });

  it('auto-disabled sentinel prevents Stop pipeline', async () => {
    const sentinels = new Sentinels(stub.coherenceDir);
    sentinels.setAutoDisabled('test crash');

    const result = await stub.stop();
    expect(result.success).toBe(true); // returns success but no-op

    // Buffer should still be empty (no processing)
    const store = await stub.makeStore();
    const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');
    expect(buf?.entries.length ?? 0).toBe(0);
  });

  it('/coherence:recover clears auto-disabled but not DISABLED', async () => {
    const sentinels = new Sentinels(stub.coherenceDir);
    sentinels.setAutoDisabled('test');
    writeFileSync(path.join(stub.coherenceDir, 'DISABLED'), 'manual\n');

    const { runRecover } = await import('../../src/commands/recover.js');
    await runRecover(stub.coherenceDir);

    expect(sentinels.isAutoDisabled()).toBe(false);
    expect(sentinels.isManuallyDisabled()).toBe(true);
  });

  it('SessionStart respects kill-switch (returns success silently)', async () => {
    writeFileSync(path.join(stub.coherenceDir, 'DISABLED'), 'manual\n');
    const result = await stub.sessionStart();
    expect(result.success).toBe(true);
  });
});
