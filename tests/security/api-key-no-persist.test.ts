/**
 * NFR-SECURITY-3: API key must not be persisted to disk.
 * Drives a Stop pipeline with a fake probe key and verifies it never appears
 * in any file under .claude/coherence/.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';

import path from 'path';
import { ClaudeCodeStub } from '../e2e/harness/claudeCodeStub.js';

const FAKE_KEY = 'ck-FAKE-PROBE-VALUE-123';

let stub: ClaudeCodeStub;

beforeEach(() => {
  stub = new ClaudeCodeStub();
});

afterEach(() => {
  stub.destroy();
});

function grepAllFiles(dir: string, needle: string): string[] {
  const hits: string[] = [];
  if (!existsSync(dir)) return hits;

  function walk(d: string) {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch { return; }

    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        try {
          const content = readFileSync(full, 'utf8');
          if (content.includes(needle)) hits.push(full);
        } catch { /* binary files */ }
      }
    }
  }

  walk(dir);
  return hits;
}

describe('NFR-SECURITY-3: API key not persisted', () => {
  it('fake API key never written to .claude/coherence/ during stop pipeline', async () => {
    const saved = process.env['ANTHROPIC_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = FAKE_KEY;

    try {
      await stub.sessionStart();
      const filePath = stub.createDocFile('docs/api.md', [
        '<!-- coherence:section id="intro" -->',
        '# API',
        '',
        'Content.',
      ].join('\n'));
      await stub.postToolUse(filePath);
      await stub.stop();
    } finally {
      if (saved !== undefined) {
        process.env['ANTHROPIC_API_KEY'] = saved;
      } else {
        delete process.env['ANTHROPIC_API_KEY'];
      }
    }

    const hits = grepAllFiles(stub.coherenceDir, FAKE_KEY);
    expect(hits, `Found API key in: ${hits.join(', ')}`).toHaveLength(0);
  });
});
