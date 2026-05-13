/**
 * v1.0 M2 — bridge between the frontmatter `asserts:` field and the Stage 2
 * patch validation chain. Reads the section file's top-level YAML
 * frontmatter, dispatches assertions, and folds the result into the
 * validation verdict.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { parseFrontmatter } from '../../detection/yamlFrontmatter.js';
import {
  parseAsserts,
  runAssertionsForSection,
  verdict,
  type AssertionVerdict,
  type RawAssertion,
} from './index.js';

export interface PatchAssertionContext {
  sectionRef: string;
  /** Body content of the section after the patch is applied (or the current
   *  content if applied separately by the pipeline). */
  sectionContent: string;
  projectRoot: string;
  /** Optional: precomputed asserts list for tests / cassette replays. */
  precomputedAsserts?: RawAssertion[];
  /** Override the stderr warning sink (testable). */
  emitWarning?: (msg: string) => void;
}

export async function applyAssertions(ctx: PatchAssertionContext): Promise<AssertionVerdict> {
  let asserts: RawAssertion[] = [];
  if (ctx.precomputedAsserts) {
    asserts = ctx.precomputedAsserts;
  } else {
    const filePath = ctx.sectionRef.split('#')[0] ?? '';
    if (filePath.length > 0) {
      const abs = path.resolve(ctx.projectRoot, filePath);
      if (existsSync(abs)) {
        try {
          const raw = readFileSync(abs, 'utf8');
          const fm = parseFrontmatter(raw);
          if (fm.data && Array.isArray((fm.data as { asserts?: unknown }).asserts)) {
            asserts = parseAsserts((fm.data as { asserts: unknown }).asserts);
          }
        } catch {
          /* missing/unreadable file → no assertions */
        }
      }
    }
  }
  if (asserts.length === 0) return { ok: true, blocks: [], warns: [] };
  const results = await runAssertionsForSection(ctx.sectionRef, ctx.sectionContent, asserts, {
    projectRoot: ctx.projectRoot,
    emitWarning: ctx.emitWarning ?? ((m): void => console.error(m)),
  });
  return verdict(results);
}
