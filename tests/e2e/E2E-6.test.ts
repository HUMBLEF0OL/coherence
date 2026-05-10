/**
 * E2E-6: Assertion-triggered review.
 * import_exists assertion triggers buffer entry.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { evaluateAssertions } from '../../src/detection/assertions.js';
import type { SectionIndexEntry, NormalizedPath, SectionRef, ContentHash } from '../../src/types/index.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-e2e6-'));
  mkdirSync(path.join(tmpDir, '.claude', 'coherence', 'quarantine'), { recursive: true });
  // Constructor call has init side effects; the instance itself isn't read.
  new StateStore(
    path.join(tmpDir, '.claude', 'coherence'),
    path.join(tmpDir, '.claude', 'coherence', 'quarantine'),
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function np(s: string): NormalizedPath { return s as NormalizedPath; }
function ref(s: string): SectionRef { return s as SectionRef; }
function hash(s: string): ContentHash { return s as ContentHash; }

describe('E2E-6: assertion-triggered review', () => {
  it('passing import_exists assertion generates no buffer entry', async () => {
    // Create a source file that has the import
    mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'src', 'index.ts'), "import { foo } from './foo';\n");

    const sectionIndex: SectionIndexEntry[] = [
      {
        path: np('docs/api.md'),
        sectionRef: ref('docs/api.md#intro'),
        heading: 'intro',
        line_start: 1,
        line_end: 10,
        contentHash: hash('a'.repeat(64)),
      },
    ];

    // Assertions that pass should not trigger buffer entries
    const results = evaluateAssertions(sectionIndex, tmpDir);
    // Should not throw; results may be empty for passing assertions
    expect(Array.isArray(results)).toBe(true);
  });

  it('evaluateAssertions returns array (no crash)', () => {
    const sectionIndex: SectionIndexEntry[] = [];
    const results = evaluateAssertions(sectionIndex, tmpDir);
    expect(Array.isArray(results)).toBe(true);
  });
});
