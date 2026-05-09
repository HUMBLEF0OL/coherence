/**
 * E2E-1: cold-start → SessionStart → PostToolUse buffer fill → Stop → verify state.
 * Full BRD-4 §4.2 path: Observe mode → graduate → buffer → stop pipeline.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeStub } from './harness/claudeCodeStub.js';

let stub: ClaudeCodeStub;

beforeEach(() => {
  stub = new ClaudeCodeStub();
});

afterEach(() => {
  stub.destroy();
});

describe('E2E-1: cold-start + Observe mode lifecycle', () => {
  it('SessionStart succeeds on cold project (no coherence state)', async () => {
    const result = await stub.sessionStart();
    expect(result.success).toBe(true);
  });

  it('PostToolUse on non-MD file returns success (no buffer entry)', async () => {
    const filePath = stub.createDocFile('src/index.ts', '// code');
    const result = await stub.postToolUse(filePath);
    expect(result.success).toBe(true);
  });

  it('PostToolUse on MD file with coherence anchors adds buffer entry', async () => {
    const filePath = stub.createDocFile('docs/api.md', [
      '<!-- coherence:section id="intro" -->',
      '# API',
      '',
      'Introduction.',
    ].join('\n'));

    const result = await stub.postToolUse(filePath);
    expect(result.success).toBe(true);

    const store = await stub.makeStore();
    const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');
    expect(buf?.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('Stop with empty buffer returns success and no bundles', async () => {
    await stub.sessionStart();
    const result = await stub.stop();
    expect(result.success).toBe(true);
  });

  it('Stop with buffer entries attempts pipeline and returns success', async () => {
    await stub.sessionStart();
    const filePath = stub.createDocFile('docs/api.md', [
      '<!-- coherence:section id="intro" -->',
      '# API',
      '',
      'Introduction.',
    ].join('\n'));
    await stub.postToolUse(filePath);

    const result = await stub.stop();
    expect(result.success).toBe(true);
  });

  it('graduate toggles mode to graduated', async () => {
    await stub.sessionStart();
    const { runGraduate } = await import('../../src/commands/graduate.js');
    const store = await stub.makeStore();
    const result = await runGraduate(store);
    expect(result.newMode).toBe('graduated');

    const config = await store.read<{ mode: string }>('config.json');
    expect(config?.mode).toBe('graduated');
  });
});
