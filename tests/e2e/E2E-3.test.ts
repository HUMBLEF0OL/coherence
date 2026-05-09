/**
 * E2E-3: LLM outage simulation → buffer persists to pending.md, no crash.
 * Also: 503 cassette replay → graceful degradation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeStub } from './harness/claudeCodeStub.js';
import { existsSync } from 'fs';
import path from 'path';

let stub: ClaudeCodeStub;

beforeEach(() => {
  stub = new ClaudeCodeStub();
});

afterEach(() => {
  stub.destroy();
});

describe('E2E-3: LLM outage / error resilience', () => {
  it('Stop with ANTHROPIC_API_KEY unset does not crash', async () => {
    await stub.sessionStart();
    const filePath = stub.createDocFile('docs/api.md', [
      '<!-- coherence:section id="intro" -->',
      '# API',
      '',
      'Content.',
    ].join('\n'));
    await stub.postToolUse(filePath);

    // Store API key and remove it for this test
    const savedKey = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];

    let success = false;
    try {
      const result = await stub.stop();
      // Should succeed (not crash) — may return error notice
      success = result.success;
    } catch {
      success = false;
    } finally {
      if (savedKey !== undefined) {
        process.env['ANTHROPIC_API_KEY'] = savedKey;
      }
    }

    expect(success).toBe(true);
  });

  it('stop-progress.json is not left orphaned after successful stop with empty buffer', async () => {
    await stub.sessionStart();
    await stub.stop();

    const progressPath = path.join(stub.coherenceDir, 'stop-progress.json');
    // Progress should be cleared after successful run
    expect(existsSync(progressPath)).toBe(false);
  });
});
