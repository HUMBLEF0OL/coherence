/**
 * NFR-PRIVACY-4 negative: drift-buffer.json must not contain raw section content.
 * Only {path, sectionRef, contentHash} per entry.
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { BufferLifecycle } from '../../src/buffer/lifecycle.js';
import { StateStore } from '../../src/state/stateStore.js';
import type { BufferEntry, NormalizedPath, SectionRef, ContentHash } from '../../src/types/index.js';
import { hashContent } from '../../src/buffer/contentHash.js';

describe('buffer no-raw-content (NFR-PRIVACY-4)', () => {
  it('drift-buffer.json entries contain only path, sectionRef, contentHash — no raw text', async () => {
    const dir = path.join(tmpdir(), `coh-priv-${Date.now()}`);
    const qDir = path.join(dir, 'quarantine');
    mkdirSync(qDir, { recursive: true });
    const store = new StateStore(dir, qDir);
    const buffer = new BufferLifecycle(store);

    const rawContent = 'This is the secret raw section content that must never persist';
    const entry: BufferEntry = {
      path: '/docs/secret.md' as NormalizedPath,
      sectionRef: '/docs/secret.md#private-section' as SectionRef,
      contentHash: hashContent(rawContent),
      triggeredAt: new Date().toISOString(),
      source: 'posttooluse',
    };

    await buffer.append(entry);

    const fileContent = readFileSync(path.join(dir, 'drift-buffer.json'), 'utf8');
    expect(fileContent).not.toContain(rawContent);
    expect(fileContent).toContain('contentHash');
    // Verify contentHash is a sha256 (64 hex chars)
    const parsed = JSON.parse(fileContent) as { entries: Array<{ contentHash: string }> };
    expect(parsed.entries[0]!.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
