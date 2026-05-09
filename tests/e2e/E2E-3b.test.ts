/**
 * E2E-3b: Concurrent PostToolUse events — buffer deduplication.
 * Multiple events for the same sectionRef → only one entry retained.
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

describe('E2E-3b: buffer deduplication', () => {
  it('multiple PostToolUse for same file deduplicates to 1 entry per section', async () => {
    await stub.sessionStart();

    const content = [
      '<!-- coherence:section id="intro" -->',
      '# API',
      '',
      'v1.',
    ].join('\n');
    const filePath = stub.createDocFile('docs/api.md', content);

    // Emit PostToolUse 3 times for same file
    await stub.postToolUse(filePath);
    await stub.postToolUse(filePath);
    await stub.postToolUse(filePath);

    const store = await stub.makeStore();
    const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');

    // Buffer deduplicates by sectionRef → only 1 entry
    expect(buf?.entries.length).toBe(1);
  });

  it('different files produce separate entries', async () => {
    await stub.sessionStart();

    const docContent = (id: string) => [
      `<!-- coherence:section id="${id}" -->`,
      `# Doc ${id}`,
      '',
      'Content.',
    ].join('\n');

    const f1 = stub.createDocFile('docs/a.md', docContent('a'));
    const f2 = stub.createDocFile('docs/b.md', docContent('b'));

    await stub.postToolUse(f1);
    await stub.postToolUse(f2);

    const store = await stub.makeStore();
    const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');
    expect(buf?.entries.length).toBe(2);
  });
});
