/**
 * E2E-12: mcp-sentry fixture with REAL recorded LLM cassettes.
 *
 * This is the M2 closure from the v1.0.1 carry-over: replay actual
 * Stage 1 + Stage 2 responses from claude-sonnet-4-6 against the
 * mcp-sentry fixture and lock the patches into a regression test.
 *
 * The cassettes under `tests/cassettes/mcp-sentry/` were recorded
 * by `scripts/record-mcp-sentry-cassettes.mjs` on 2026-05-14 using
 * Claude Code subscription auth. The fixture files under
 * `tests/fixtures/mcp-sentry/` are a frozen snapshot of mcp-sentry's
 * `test/coherence-v1-smoke` branch at commit `9097294` — the
 * `gradeBelow -> isBelowThreshold` rename drift.
 *
 * Asserted end-to-end facts (what the REAL LLM produced):
 *
 *   1. Stage 1 picks the SKILL as canonical, agent + doc as mirrors.
 *   2. Stage 2 for SKILL.md#grading-rules:
 *        - returns a valid `modifying` unified diff
 *        - the diff replaces `gradeBelow(actual, threshold)` with
 *          `isBelowThreshold(actual, threshold)`
 *        - passes the full 7-stage validation chain (apply, sanity,
 *          line-ratio, prompt-injection, hallucination, assertions)
 *   3. Stage 2 for sentry-reviewer.md#grading-calls:
 *        - the LLM chose to ESCALATE (real judgment, preserved as-is)
 *   4. Stage 2 for reference.md#reviewer-agent:
 *        - returns a valid `modifying` unified diff
 *        - replaces TWO occurrences of `gradeBelow` with
 *          `isBelowThreshold`
 *        - passes validation
 *   5. Trust ladder DEFERS both valid patches at fresh score 0.
 *   6. Bundle contains exactly the 2 applicable patches (skill + doc;
 *      the ESCALATEd agent is excluded).
 *
 * Re-record:
 *   node scripts/record-mcp-sentry-cassettes.mjs --force
 *
 * The cassette layer's COHERENCE_REFRESH_CASSETTES=1 guard means
 * accidental re-runs of the live LLM are blocked unless explicitly
 * requested.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import { cpSync, mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'fs';
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

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures', 'mcp-sentry');
const CASSETTE_DIR = path.resolve(__dirname, '..', 'cassettes');

const STAGE1_CASSETTE_ID = 'mcp-sentry/stage1-grading';
const SECTIONS = [
  { sectionRef: '.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules',
    path: '.claude/skills/mcp-sentry-grader/SKILL.md',
    cassette: 'mcp-sentry/stage2-skill-grading-rules' },
  { sectionRef: '.claude/agents/sentry-reviewer.md#grading-calls',
    path: '.claude/agents/sentry-reviewer.md',
    cassette: 'mcp-sentry/stage2-agent-grading-calls' },
  { sectionRef: 'docs/agents-and-skills/reference.md#reviewer-agent',
    path: 'docs/agents-and-skills/reference.md',
    cassette: 'mcp-sentry/stage2-doc-reviewer-agent' },
];

interface Fixture {
  projectRoot: string;
  cleanup: () => void;
}

async function buildFixture(): Promise<Fixture> {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'cohrence-mcp-sentry-'));
  cpSync(FIXTURE_DIR, projectRoot, { recursive: true });

  // git init the fixture — apply.ts runs `git apply --check`, which is
  // more permissive on hunk boundaries inside a real repo.
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] });
  git(['init', '--quiet']);
  git(['-c', 'user.email=e2e@example.com', '-c', 'user.name=E2E', 'add', '.']);
  git(['-c', 'user.email=e2e@example.com', '-c', 'user.name=E2E', 'commit', '-q', '-m', 'fixture seed']);

  await initCoherenceDir(projectRoot);

  return {
    projectRoot,
    cleanup: () => {
      try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* */ }
    },
  };
}

function collectSourceCorpus(root: string): string[] {
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.claude', 'docs']);
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const full = path.join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      else if (st.isFile() && /\.(ts|tsx|js|jsx)$/.test(name)) {
        try { out.push(readFileSync(full, 'utf8')); } catch { /* */ }
      }
    }
  };
  walk(root);
  return out;
}

describe('E2E-12: mcp-sentry fixture (REAL recorded cassettes)', () => {
  let fx: Fixture;
  let savedCassettesDir: string | undefined;

  beforeAll(async () => {
    fx = await buildFixture();
    savedCassettesDir = process.env['COHERENCE_CASSETTES_DIR'];
    process.env['COHERENCE_CASSETTES_DIR'] = CASSETTE_DIR;
    // Belt-and-braces: never let this test accidentally hit the live LLM
    // even if cassettes are missing — refresh=1 would also enable recording.
    delete process.env['COHERENCE_REFRESH_CASSETTES'];
  });

  afterAll(() => {
    if (savedCassettesDir === undefined) delete process.env['COHERENCE_CASSETTES_DIR'];
    else process.env['COHERENCE_CASSETTES_DIR'] = savedCassettesDir;
    fx.cleanup();
  });

  it('Stage 1 plan: skill canonical, agent + doc mirror', async () => {
    const store = makeStateStore(fx.projectRoot);
    const sectionIndex = SECTIONS.map((s) => {
      const [pth, id] = s.sectionRef.split('#');
      return { sectionRef: s.sectionRef, path: pth, heading: id };
    });
    const cl = new CostLedger(store, 'e2e12-s1');
    const plan = await runStage1(
      {
        entries: SECTIONS.map((s) => ({ sectionRef: s.sectionRef, path: s.path })) as never,
        triggering_files: ['packages/cli/src/grade.ts'] as never,
      } as never,
      sectionIndex as never,
      cl,
      STAGE1_CASSETTE_ID,
    );
    expect(plan).not.toBeNull();
    expect(plan!.canonical).toBe('.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules');
    expect(plan!.sections.length).toBe(3);
    const roles = new Map(plan!.sections.map((s: any) => [s.sectionRef, s.role]));
    expect(roles.get('.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules')).toBe('canonical');
    expect(roles.get('.claude/agents/sentry-reviewer.md#grading-calls')).toBe('reference');
    expect(roles.get('docs/agents-and-skills/reference.md#reviewer-agent')).toBe('reference');
  });

  it('Stage 2 pipeline produces the recorded patches (2 valid + 1 ESCALATE)', async () => {
    const store = makeStateStore(fx.projectRoot);
    const lifecycle = new BufferLifecycle(store);

    // Seed the buffer with what PostToolUse would have written.
    for (const s of SECTIONS) {
      const text = readFileSync(path.join(fx.projectRoot, s.path), 'utf8');
      const { sections } = scanAnchors(text, s.path);
      const id = s.sectionRef.split('#')[1];
      const section = sections.find((x) => x.id === id);
      expect(section, `section ${s.sectionRef} not found in fixture`).toBeDefined();
      await lifecycle.append({
        path: s.path as never,
        sectionRef: s.sectionRef as never,
        contentHash: hashContent(section!.content),
        triggeredAt: nowIsoUtc(),
        source: 'posttooluse',
      });
    }

    const buf = await lifecycle.read();
    expect(buf.entries.length).toBe(3);

    const sectionIndex = SECTIONS.map((s) => {
      const [pth, id] = s.sectionRef.split('#');
      return { sectionRef: s.sectionRef, path: pth, heading: id };
    });

    const stage1Ledger = new CostLedger(store, 'e2e12-s1-replay');
    const plan = await runStage1(
      {
        entries: SECTIONS.map((s) => ({ sectionRef: s.sectionRef, path: s.path })) as never,
        triggering_files: ['packages/cli/src/grade.ts'] as never,
      } as never,
      sectionIndex as never,
      stage1Ledger,
      STAGE1_CASSETTE_ID,
    );

    function readSection(rel: string, id: string): string {
      const text = readFileSync(path.join(fx.projectRoot, rel), 'utf8');
      const { sections } = scanAnchors(text, rel);
      return sections.find((s) => s.id === id)?.content ?? '';
    }
    const layerFor = (p: string): 'skill' | 'config' | 'subagent' | 'referring-doc' =>
      /SKILL\.md$/i.test(p) ? 'skill'
      : /CLAUDE\.md$/i.test(p) ? 'config'
      : /agent/i.test(p) ? 'subagent' : 'referring-doc';

    const stage2Inputs = plan!.sections.map((ps: any) => {
      const [pth, id] = ps.sectionRef.split('#');
      const canonicalRef = plan!.canonical.split('#');
      return {
        sectionRef: ps.sectionRef,
        role: ps.role,
        relation: ps.relation ?? null,
        heading: id,
        current_content: readSection(pth, id),
        canonical_content: ps.role === 'canonical' ? null : readSection(canonicalRef[0], canonicalRef[1]),
        changed_tokens: ['gradeBelow', 'isBelowThreshold'],
        layer: layerFor(pth),
      };
    });
    const cassetteIds = new Map<string, string>();
    for (const s of SECTIONS) cassetteIds.set(s.sectionRef, s.cassette);

    const projectFileContents = collectSourceCorpus(fx.projectRoot);

    const stage2Ledger = new CostLedger(store, 'e2e12-s2');
    const results = await runStage2(
      plan as never,
      stage2Inputs as never,
      stage2Ledger,
      fx.projectRoot,
      projectFileContents,
      cassetteIds as never,
    );
    expect(results.length).toBe(3);

    // (1) SKILL.md -> valid modifying patch with the rename
    const skill = results.find((r: any) => r.patch.sectionRef === '.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules')!;
    expect(skill.patch.validationPassed).toBe(true);
    expect(skill.patch.changeClass).toBe('modifying');
    expect(skill.patch.diff).toContain('-- `gradeBelow(actual, threshold)`');
    expect(skill.patch.diff).toContain('+- `isBelowThreshold(actual, threshold)`');

    // (2) agent.md -> ESCALATE (real LLM judgment, preserved)
    const agent = results.find((r: any) => r.patch.sectionRef === '.claude/agents/sentry-reviewer.md#grading-calls')!;
    expect(agent.patch.diff).toBe('ESCALATE');
    expect(agent.patch.validationPassed).toBe(false);

    // (3) doc -> valid modifying patch replacing TWO occurrences
    const doc = results.find((r: any) => r.patch.sectionRef === 'docs/agents-and-skills/reference.md#reviewer-agent')!;
    expect(doc.patch.validationPassed).toBe(true);
    expect(doc.patch.changeClass).toBe('modifying');
    expect(doc.patch.diff).toContain('isBelowThreshold');
    // Both occurrences swapped: in the symbol list AND the example call.
    const isBelowCount = (doc.patch.diff.match(/isBelowThreshold/g) ?? []).length;
    expect(isBelowCount).toBeGreaterThanOrEqual(2);

    // (4) trust ladder: fresh score 0 -> DEFER for both valid patches
    for (const r of [skill, doc]) {
      const score = await getSectionScore(store, r.patch.sectionRef);
      expect(score).toBeLessThan(0.85);
    }

    // (5) bundle: 2 applicable patches (skill + doc); agent excluded.
    const bundle = assembleBundle('e2e12-mcp-sentry', results.map((r: any) => r.patch), plan!.canonical);
    expect(bundle.patches.length).toBe(2);
    const bundleRefs = bundle.patches.map((p: any) => p.sectionRef);
    expect(bundleRefs).toContain('.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules');
    expect(bundleRefs).toContain('docs/agents-and-skills/reference.md#reviewer-agent');
    expect(bundleRefs).not.toContain('.claude/agents/sentry-reviewer.md#grading-calls');
  });
});
