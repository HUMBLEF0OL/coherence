/**
 * E2E-11: rename-drift fixture exercising Fix 8 (LIM-1 closure) end-to-end.
 *
 * Mirrors the cohrence-dummy fixture in-process under a tmpdir so CI can
 * run it without the external `E:/Projects and Learning/cohrence-dummy`
 * directory. The fixture seeds the canonical bug class behind LIM-1:
 *
 *   - `src/calc.ts` exports `times` (the rename target)
 *   - `src/index.ts` still IMPORTS `multiply` from `./calc.js` — stale
 *     caller, broken at runtime but still text-mentioning the old name
 *   - SKILL.md frontmatter declares `symbol_exported:multiply:typescript`
 *     with policy=block
 *
 * Asserted end-to-end facts:
 *
 *   1. Stage 1 produces a 4-section plan with the SKILL as canonical.
 *   2. Stage 2 BLOCKS the SKILL section via the `symbol_exported` engine
 *      (Fix 8) — diff = ESCALATE, validationLog cites the assertion.
 *   3. The other 3 sections pass the full 7-stage validation chain.
 *   4. All 3 valid patches sit at trust score 0.0 and DEFER (DD-131:
 *      `modifying` patches only auto-apply at score ≥ 0.85).
 *   5. `assembleBundle` packages the 3 applicable patches under the SKILL
 *      canonical.
 *
 * Why this test exists: the v1.0.1 carry-over surfaced that
 * `/coherence:review` against the dummy "showed nothing" because the
 * smoke harness bypassed the hook layer (no `drift-buffer.json` ever got
 * written). This test exercises the production pipeline modules against
 * a seeded buffer and locks in the rename-drift outcome shape so future
 * regressions in Fix 8 or the trust ladder are caught at PR time.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { initCoherenceDir, makeStateStore } from '../../src/state/init.js';
import { BufferLifecycle } from '../../src/buffer/lifecycle.js';
import { hashContent } from '../../src/buffer/contentHash.js';
import { nowIsoUtc } from '../../src/util/time.js';
import { scanAnchors } from '../../src/detection/anchorScanner.js';
import { runStage1 } from '../../src/pipeline/stage1.js';
import { runStage2 } from '../../src/pipeline/stage2.js';
import { CostLedger } from '../../src/llm/costLedger.js';
import { getSectionScore } from '../../src/state/trustLedger.js';
import { assembleBundle } from '../../src/pipeline/bundle.js';
import { runReview } from '../../src/commands/review.js';

// Fixture content — inlined so the test is self-contained and CI doesn't
// depend on the external dummy directory.
const FIX_CALC_TS_DRIFTED = `export function add(a: number, b: number): number { return a + b; }
export function subtract(a: number, b: number): number { return a - b; }
export function times(a: number, b: number): number { return a * b; }
export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}
export interface CalcOptions { precision?: number; }
`;

const FIX_INDEX_TS_STALE = `import { add, subtract, multiply, divide } from './calc.js';
import type { CalcOptions } from './calc.js';
export { add, subtract, divide };
export type { CalcOptions };
export function area(width: number, height: number): number {
  return multiply(width, height);
}
`;

const FIX_SKILL_MD = `---
name: calc-helper
description: Skill that documents the calc module's surface.
asserts:
  - type: has_example
    policy: warn
  - type: symbol_exists
    param: add:typescript
    policy: block
  - type: file_exists
    param: src/calc.ts
    policy: block
  - type: symbol_exported
    param: add:typescript
    policy: block
  - type: symbol_exported
    param: multiply:typescript
    policy: block
---

# calc-helper

<!-- coherence:section id="basics" -->
## Basics

The \`calc\` module exports four pure functions:

- \`add(a, b)\` — addition
- \`subtract(a, b)\` — subtraction
- \`multiply(a, b)\` — multiplication
- \`divide(a, b)\` — division

\`\`\`ts
import { add, multiply } from './calc.js';
console.log(add(2, multiply(3, 4)));
\`\`\`
<!-- /coherence:section -->
`;

const FIX_AGENT_MD = `---
name: calc-reviewer
description: Agent that reviews calc-related PRs.
---

# calc-reviewer

<!-- coherence:section id="symbol-surface" -->
## Symbol surface

This agent watches the following symbols:

- \`add\`, \`subtract\`, \`multiply\`, \`divide\` — the four pure functions.
- \`CalcOptions\` — config interface.
<!-- /coherence:section -->
`;

const FIX_CALC_DOC = `# Calc API

<!-- coherence:section id="overview" -->
## Overview

The \`calc\` package provides \`add\`, \`subtract\`, \`multiply\`, and
\`divide\`. See \`.claude/skills/calc-helper/SKILL.md\` for the full
contract. Each function is a pure binary operation on numbers.
<!-- /coherence:section -->

<!-- coherence:section id="examples" -->
## Examples

The most common combinations look like:

\`\`\`ts
import { multiply } from 'cohrence-dummy';
multiply(3, 4);
\`\`\`
<!-- /coherence:section -->
`;

interface Fixture {
  projectRoot: string;
  cassetteDir: string;
  cleanup: () => void;
}

async function buildFixture(): Promise<Fixture> {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'cohrence-e2e11-'));
  const cassetteDir = mkdtempSync(path.join(os.tmpdir(), 'cohrence-e2e11-cass-'));

  const w = (rel: string, content: string) => {
    const full = path.join(projectRoot, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  };

  w('src/calc.ts', FIX_CALC_TS_DRIFTED);
  w('src/index.ts', FIX_INDEX_TS_STALE);
  w('.claude/skills/calc-helper/SKILL.md', FIX_SKILL_MD);
  w('.claude/agents/calc-reviewer.md', FIX_AGENT_MD);
  w('docs/api/calc.md', FIX_CALC_DOC);

  // git init so `git apply --check` (called by validation/apply.ts) can
  // anchor patches against the index. Without a repo, git apply is
  // stricter about hunk-boundary line counts on files that end at EOF.
  const git = (args: string[]) => execFileSync('git', args, { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] });
  git(['init', '--quiet']);
  git(['-c', 'user.email=e2e@example.com', '-c', 'user.name=E2E', 'add', '.']);
  git(['-c', 'user.email=e2e@example.com', '-c', 'user.name=E2E', 'commit', '-q', '-m', 'fixture seed']);

  await initCoherenceDir(projectRoot);

  return {
    projectRoot,
    cassetteDir,
    cleanup: () => {
      try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* */ }
      try { rmSync(cassetteDir, { recursive: true, force: true }); } catch { /* */ }
    },
  };
}

function writeCassette(dir: string, id: string, content: string, inputTokens = 1200, outputTokens = 200): string {
  const file = path.join(dir, id + '.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({
    content,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: inputTokens * 3.0 / 1e6 + outputTokens * 15.0 / 1e6,
    timestamp: new Date().toISOString(),
  }, null, 2), 'utf8');
  return id;
}

function makeDiffForLine(projectRoot: string, rel: string, oldSubstr: string, newSubstr: string): string | null {
  const full = path.join(projectRoot, rel);
  const text = readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  // String.split('\n') leaves a trailing '' for files that end with \n.
  // Drop it so the hunk's context count matches the file's actual line count
  // (git apply rejects "corrupt patch" when the header claims more context
  // lines than the file really has past the change).
  if (lines.length > 0 && lines[lines.length - 1] === '' && text.endsWith('\n')) {
    lines.pop();
  }
  // Skip past YAML frontmatter — the rename target lives in the body, and
  // the frontmatter contains the `param: multiply:typescript` assertion
  // declaration which we must not overwrite.
  let bodyStart = 0;
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') { bodyStart = i + 1; break; }
    }
  }
  const idx = lines.findIndex((l, i) => i >= bodyStart && l.includes(oldSubstr));
  if (idx === -1) return null;
  const start = Math.max(0, idx - 3);
  let end = Math.min(lines.length - 1, idx + 3);
  // Trim trailing empty lines from the context window: parseStage2Response
  // calls raw.trim() on the LLM response, which would strip a trailing
  // ` ` (space-prefixed empty context line) entirely. The Fix-4 re-add
  // (apply.ts) only restores a single `\n`, not a whole context line —
  // so the hunk header would claim more context than survives the trim.
  while (end > idx && lines[end] === '') end--;
  const ctx = lines.slice(start, end + 1);
  const body: string[] = [];
  for (let i = 0; i < ctx.length; i++) {
    if (i === idx - start) {
      body.push('-' + ctx[i]);
      body.push('+' + ctx[i].replace(oldSubstr, newSubstr));
    } else body.push(' ' + ctx[i]);
  }
  return [
    `--- a/${rel}`,
    `+++ b/${rel}`,
    `@@ -${start + 1},${ctx.length} +${start + 1},${ctx.length} @@`,
    ...body,
    '',
  ].join('\n');
}

describe('E2E-11: rename-drift fixture (Fix 8 + trust ladder DEFER)', () => {
  let fx: Fixture;
  let savedCassettesDir: string | undefined;

  beforeAll(async () => {
    fx = await buildFixture();
    savedCassettesDir = process.env['COHERENCE_CASSETTES_DIR'];
    process.env['COHERENCE_CASSETTES_DIR'] = fx.cassetteDir;
  });

  afterAll(() => {
    if (savedCassettesDir === undefined) delete process.env['COHERENCE_CASSETTES_DIR'];
    else process.env['COHERENCE_CASSETTES_DIR'] = savedCassettesDir;
    fx.cleanup();
  });

  it('/coherence:review with empty buffer reports the empty-buffer message', async () => {
    const store = makeStateStore(fx.projectRoot);
    const result = await runReview(store, [], {
      estimate: false,
      sessionId: 'e2e11-empty',
      projectRoot: fx.projectRoot,
      mode: 'observe',
    });
    expect(result.message).toContain('Buffer is empty');
  });

  it('seeded buffer + full pipeline: Fix 8 blocks SKILL.md, 3 patches DEFER at score 0', async () => {
    const store = makeStateStore(fx.projectRoot);
    const lifecycle = new BufferLifecycle(store);

    const SECTIONS = [
      { rel: '.claude/skills/calc-helper/SKILL.md', id: 'basics' },
      { rel: '.claude/agents/calc-reviewer.md',     id: 'symbol-surface' },
      { rel: 'docs/api/calc.md',                    id: 'overview' },
      { rel: 'docs/api/calc.md',                    id: 'examples' },
    ];

    // Seed the buffer with what PostToolUse would have written if Claude
    // Code had performed the rename via Edit.
    for (const { rel, id } of SECTIONS) {
      const text = readFileSync(path.join(fx.projectRoot, rel), 'utf8');
      const { sections } = scanAnchors(text, rel);
      const section = sections.find((s) => s.id === id)!;
      await lifecycle.append({
        path: rel as never,
        sectionRef: `${rel}#${id}` as never,
        contentHash: hashContent(section.content),
        triggeredAt: nowIsoUtc(),
        source: 'posttooluse',
      });
    }
    const buf = await lifecycle.read();
    expect(buf.entries.length).toBe(4);
    expect(buf.state).toBe('pending');

    // Section index across the fixture.
    const sectionIndex: { sectionRef: string; path: string; heading: string }[] = [];
    for (const { rel, id } of SECTIONS) {
      sectionIndex.push({ sectionRef: `${rel}#${id}`, path: rel, heading: id });
    }

    // Stage 1 plan (cassette-driven so we don't hit the live LLM).
    const stage1Plan = {
      canonical: '.claude/skills/calc-helper/SKILL.md#basics',
      sections: [
        { sectionRef: '.claude/skills/calc-helper/SKILL.md#basics', role: 'canonical' },
        { sectionRef: '.claude/agents/calc-reviewer.md#symbol-surface', role: 'reference', relation: 'mirrors' },
        { sectionRef: 'docs/api/calc.md#overview', role: 'reference', relation: 'summarises' },
        { sectionRef: 'docs/api/calc.md#examples', role: 'reference', relation: 'expands' },
      ],
    };
    const s1Id = writeCassette(fx.cassetteDir, 'e2e11/stage1', JSON.stringify(stage1Plan));

    const cl1 = new CostLedger(store, 'e2e11-stage1');
    const plan = await runStage1(
      {
        entries: SECTIONS.map(({ rel, id }) => ({
          sectionRef: `${rel}#${id}`, path: rel,
        })) as never,
        triggering_files: ['src/calc.ts'] as never,
      } as never,
      sectionIndex as never,
      cl1,
      s1Id,
    );
    expect(plan).not.toBeNull();
    expect(plan!.canonical).toBe('.claude/skills/calc-helper/SKILL.md#basics');
    expect(plan!.sections.length).toBe(4);

    // Stage 2 — one cassette per section, each containing the
    // multiply → times unified diff.
    const projectFileContents: string[] = [];
    for (const rel of ['src/calc.ts', 'src/index.ts']) {
      projectFileContents.push(readFileSync(path.join(fx.projectRoot, rel), 'utf8'));
    }

    const layerFor = (p: string): 'skill' | 'config' | 'subagent' | 'referring-doc' =>
      /SKILL\.md$/i.test(p) ? 'skill'
      : /CLAUDE\.md$/i.test(p) ? 'config'
      : /agent/i.test(p) ? 'subagent' : 'referring-doc';

    const stage2Inputs = plan!.sections.map((ps: any) => {
      const [pth, id] = ps.sectionRef.split('#');
      const text = readFileSync(path.join(fx.projectRoot, pth), 'utf8');
      const { sections } = scanAnchors(text, pth);
      const current_content = sections.find((s) => s.id === id)?.content ?? '';
      const canonical_content = ps.role === 'canonical'
        ? null
        : (() => {
            const [cp, cid] = plan!.canonical.split('#');
            const ct = readFileSync(path.join(fx.projectRoot, cp), 'utf8');
            const { sections: cs } = scanAnchors(ct, cp);
            return cs.find((s) => s.id === cid)?.content ?? '';
          })();
      return {
        sectionRef: ps.sectionRef,
        role: ps.role,
        relation: ps.relation ?? null,
        heading: id,
        current_content,
        canonical_content,
        changed_tokens: ['multiply', 'times'],
        layer: layerFor(pth),
      };
    });

    const cassetteIds = new Map<string, string>();
    for (const input of stage2Inputs) {
      const [rel] = input.sectionRef.split('#');
      const diff = makeDiffForLine(fx.projectRoot, rel, 'multiply', 'times');
      const cid = `e2e11/stage2-${input.sectionRef.replace(/[^a-z0-9]/gi, '_')}`;
      writeCassette(fx.cassetteDir, cid, diff ?? 'NO_PATCH_NEEDED', 1350, 280);
      cassetteIds.set(input.sectionRef, cid);
    }

    const cl2 = new CostLedger(store, 'e2e11-stage2');
    const results = await runStage2(
      plan as never,
      stage2Inputs as never,
      cl2,
      fx.projectRoot,
      projectFileContents,
      cassetteIds as never,
    );

    expect(results.length).toBe(4);

    // 1) SKILL.md must be blocked by Fix 8's symbol_exported engine.
    const skill = results.find((r: any) => r.patch.sectionRef === '.claude/skills/calc-helper/SKILL.md#basics')!;
    expect(skill.patch.validationPassed).toBe(false);
    expect(skill.patch.diff).toBe('ESCALATE');
    const skillLog = skill.validationLog.join(' ');
    expect(skillLog).toMatch(/symbol_exported/);
    expect(skillLog).toMatch(/multiply/);
    expect(skillLog).toMatch(/BLOCK/);

    // 2) The other three sections pass validation.
    const others = results.filter((r: any) => r.patch.sectionRef !== '.claude/skills/calc-helper/SKILL.md#basics');
    expect(others.length).toBe(3);
    for (const r of others) {
      expect(r.patch.validationPassed).toBe(true);
      expect(r.patch.changeClass).toBe('modifying');
      expect(typeof r.patch.diff).toBe('string');
      expect(r.patch.diff).not.toBe('NO_PATCH_NEEDED');
      expect(r.patch.diff).not.toBe('ESCALATE');
    }

    // 3) Trust ladder DEFERS all valid patches at fresh score 0.000.
    const ledgerStore = makeStateStore(fx.projectRoot);
    for (const r of others) {
      const score = await getSectionScore(ledgerStore, r.patch.sectionRef);
      expect(score).toBeLessThan(0.85);
      const wouldAutoApply = r.patch.changeClass === 'modifying'
        && r.patch.validationPassed
        && score >= 0.85;
      expect(wouldAutoApply).toBe(false);
    }

    // 4) Bundle assembled with exactly the 3 applicable patches.
    const bundle = assembleBundle(
      'e2e11-rename-drift',
      results.map((r: any) => r.patch),
      plan!.canonical,
    );
    expect(bundle.patches.length).toBe(3);
    for (const p of bundle.patches) {
      expect(p.sectionRef).not.toBe('.claude/skills/calc-helper/SKILL.md#basics');
    }
  });
});
