/**
 * Assertion engine: import_exists evaluator.
 * TS-5 §5.7, FR-STOP-19, DD-054
 * Failures append synthetic-trigger buffer entries with source: "assertion".
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import type { BufferEntry, NormalizedPath, SectionRef, ContentHash } from '../types/index.js';
import { hashContent } from '../buffer/contentHash.js';
import { nowIsoUtc } from '../util/time.js';

export interface AssertionDef {
  type: 'import_exists';
  token: string;
  /** Section to flag if assertion fails */
  sectionRef: SectionRef;
}

export interface AssertionResult {
  passed: boolean;
  assertion: AssertionDef;
  syntheticEntry?: BufferEntry;
}

/** Walk source files in projectRoot and search for import/require of token */
function tokenExistsInCodebase(token: string, projectRoot: string): boolean {
  const CODE_EXTS = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.rb', '.php'];
  const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.cache'];

  function walk(dir: string): boolean {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return false; }

    for (const entry of entries) {
      if (SKIP_DIRS.includes(entry)) continue;
      const full = path.join(dir, entry);
      let stat: { isDirectory(): boolean; isFile(): boolean };
      try { stat = statSync(full); } catch { continue; }

      if (stat.isDirectory()) {
        if (walk(full)) return true;
        continue;
      }
      if (!stat.isFile()) continue;
      if (!CODE_EXTS.some((ext) => entry.endsWith(ext))) continue;

      try {
        const content = readFileSync(full, 'utf8');
        if (content.includes(token)) return true;
      } catch { /* skip */ }
    }
    return false;
  }

  return walk(projectRoot);
}

export function evaluateAssertions(
  assertions: AssertionDef[],
  projectRoot: string,
): AssertionResult[] {
  return assertions.map((assertion) => {
    if (assertion.type === 'import_exists') {
      const passed = tokenExistsInCodebase(assertion.token, projectRoot);
      if (passed) return { passed: true, assertion };

      const syntheticEntry: BufferEntry = {
        path: assertion.sectionRef.split('#')[0] as NormalizedPath,
        sectionRef: assertion.sectionRef,
        contentHash: hashContent(`assertion:import_exists:${assertion.token}`) as ContentHash,
        triggeredAt: nowIsoUtc(),
        source: 'assertion',
      };
      return { passed: false, assertion, syntheticEntry };
    }
    // Unknown assertion type — pass silently
    return { passed: true, assertion };
  });
}
