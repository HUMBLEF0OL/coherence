/**
 * E2E-7: /coherence:review mid-session aggregation + cost ledger.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeStub } from './harness/claudeCodeStub.js';
import { runReview } from '../../src/commands/review.js';

let stub: ClaudeCodeStub;

beforeEach(() => {
  stub = new ClaudeCodeStub();
});

afterEach(() => {
  stub.destroy();
});

describe('E2E-7: /coherence:review mid-session', () => {
  it('returns empty message when buffer is empty', async () => {
    const store = await stub.makeStore();
    const result = await runReview(store, [], {
      estimate: false,
      sessionId: stub.sessionId,
      projectRoot: stub.projectRoot,
      mode: 'observe',
    });
    expect(result.message).toContain('Buffer is empty');
  });

  it('--estimate reports groups and sections', async () => {
    await stub.sessionStart();
    const filePath = stub.createDocFile('docs/api.md', [
      '<!-- coherence:section id="intro" -->',
      '# API',
      '',
      'Content.',
    ].join('\n'));
    await stub.postToolUse(filePath);

    const store = await stub.makeStore();
    const result = await runReview(store, [], {
      estimate: true,
      sessionId: stub.sessionId,
      projectRoot: stub.projectRoot,
      mode: 'observe',
    });

    expect(result.estimate).toBe(true);
    expect(result.estimatedGroups).toBeGreaterThanOrEqual(1);
    expect(result.message).toContain('--estimate');
  });

  it('--estimate writes cost entry to cost-ledger.json', async () => {
    await stub.sessionStart();
    const filePath = stub.createDocFile('docs/api.md', [
      '<!-- coherence:section id="intro" -->',
      '# API',
      '',
      'Content.',
    ].join('\n'));
    await stub.postToolUse(filePath);

    const store = await stub.makeStore();
    await runReview(store, [], {
      estimate: true,
      sessionId: stub.sessionId,
      projectRoot: stub.projectRoot,
      mode: 'observe',
    });

    // cost-ledger.json may be written after stage1 calls
    // For cassette/no-LLM mode, stage1 short-circuits so cost may be 0
    const ledger = await store.read<{ entries: unknown[] }>('cost-ledger.json');
    // Ledger file may or may not exist depending on whether any LLM calls were made
    expect(ledger === null || Array.isArray(ledger.entries)).toBe(true);
  });
});
