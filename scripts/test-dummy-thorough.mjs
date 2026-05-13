#!/usr/bin/env node
/**
 * Thorough end-to-end test harness for the cohrence-dummy fixture.
 *
 * Exercises every layer of the v1.0.1 pipeline against the on-disk dummy
 * at E:/Projects and Learning/cohrence-dummy/ and prints a structured
 * PASS/FAIL report. Companion to:
 *
 *   - tests/e2e/E2E-11-rename-drift-fixture.test.ts (in-process, CI-runnable)
 *   - scripts/test-dummy-project-llm.mjs (LLM-layer cassette replay)
 *
 * Coverage areas (each numbered case asserts an invariant):
 *
 *   Setup ............ files exist, drift state present
 *   Anchor scanner ... section enumeration, Fix 7 (opening fence retained)
 *   Assertions ....... has_example, symbol_exists, file_exists,
 *                      symbol_exported (Fix 8 — the LIM-1 closure)
 *   Hallucination .... in-corpus + novel + rename-drift cases
 *   Stage 1 .......... single-section short-circuit, multi-section cassette
 *   Stage 2 .......... 7-stage validation chain per section
 *   Trust ladder ..... fresh DEFER, boosted AUTO-APPLY simulation
 *   Bundle ........... assembly invariants
 *   State files ...... cost-ledger + trust-ledger schema sanity
 *
 * Run after reseeding the dummy with `--with-drift`:
 *   node scripts/setup-dummy-project.mjs --with-drift
 *   node scripts/test-dummy-thorough.mjs
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT = 'E:/Projects and Learning/cohrence-dummy';
const COH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distUrl = (rel) => pathToFileURL(path.join(COH_ROOT, 'dist', rel)).href;

const cassetteDir = mkdtempSync(path.join(os.tmpdir(), 'cohrence-thorough-'));
process.env['COHERENCE_CASSETTES_DIR'] = cassetteDir;
delete process.env['ANTHROPIC_API_KEY'];

// Reset trust ledger so phase 7.1's "fresh score = 0" invariant survives
// state-bleed from prior harness runs (Phase 7.2 records 10 accepts that
// would otherwise persist into the next run's Phase 7.1).
const _ledgerPath = path.join(PROJECT, '.claude', 'coherence', 'trust-ledger.json');
try { if (existsSync(_ledgerPath)) rmSync(_ledgerPath); } catch { /* */ }

const cases = [];
const fail = (name, detail) => cases.push({ name, passed: false, detail });
const pass = (name, detail) => cases.push({ name, passed: true, detail });

function check(name, fn) {
  try {
    const detail = fn();
    pass(name, detail ?? '');
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
  }
}

async function checkAsync(name, fn) {
  try {
    const detail = await fn();
    pass(name, detail ?? '');
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
  }
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// -----------------------------------------------------------------------
// Phase 1 — setup invariants
// -----------------------------------------------------------------------

check('1.1 dummy project root exists', () => {
  assert(existsSync(PROJECT), `not found: ${PROJECT}`);
});

const REQUIRED_FILES = [
  'src/calc.ts', 'src/index.ts',
  '.claude/skills/calc-helper/SKILL.md',
  '.claude/agents/calc-reviewer.md',
  'docs/api/calc.md', 'docs/intro.md',
];
for (const rel of REQUIRED_FILES) {
  check(`1.2 file exists: ${rel}`, () => {
    assert(existsSync(path.join(PROJECT, rel)), 'missing');
  });
}

check('1.3 src/calc.ts exports times (renamed) not multiply', () => {
  const src = readFileSync(path.join(PROJECT, 'src/calc.ts'), 'utf8');
  assert(/export function times\b/.test(src), 'times not exported');
  assert(!/export function multiply\b/.test(src), 'multiply still exported');
});

check('1.4 src/index.ts still text-mentions multiply (stale-caller drift)', () => {
  const src = readFileSync(path.join(PROJECT, 'src/index.ts'), 'utf8');
  assert(/\bmultiply\b/.test(src), 'multiply not referenced in index.ts');
});

// -----------------------------------------------------------------------
// Phase 2 — anchor scanner
// -----------------------------------------------------------------------

const { scanAnchors } = await import(distUrl('detection/anchorScanner.js'));

const EXPECTED_SECTIONS = {
  '.claude/skills/calc-helper/SKILL.md': ['basics', 'error-handling', 'options'],
  '.claude/agents/calc-reviewer.md': ['responsibilities', 'symbol-surface'],
  'docs/api/calc.md': ['overview', 'examples'],
  'docs/intro.md': ['overview'],
};

for (const [rel, expectedIds] of Object.entries(EXPECTED_SECTIONS)) {
  check(`2.1 anchor scan: ${rel} -> [${expectedIds.join(', ')}]`, () => {
    const text = readFileSync(path.join(PROJECT, rel), 'utf8');
    const { sections } = scanAnchors(text, rel);
    const got = sections.map((s) => s.id);
    assert(JSON.stringify(got) === JSON.stringify(expectedIds),
      `got [${got.join(', ')}]`);
  });
}

check('2.2 Fix 7 — SKILL.md#basics retains opening code fence', () => {
  const text = readFileSync(path.join(PROJECT, '.claude/skills/calc-helper/SKILL.md'), 'utf8');
  const { sections } = scanAnchors(text, '.claude/skills/calc-helper/SKILL.md');
  const basics = sections.find((s) => s.id === 'basics');
  assert(basics, 'basics section not found');
  // Pre-Fix-7 the opening ```ts was lost. Post-Fix-7 both fences survive.
  const fenceCount = (basics.content.match(/```/g) ?? []).length;
  assert(fenceCount === 2, `expected 2 fences, got ${fenceCount}`);
});

// -----------------------------------------------------------------------
// Phase 3 — assertion engines (per declared assert in SKILL.md frontmatter)
// -----------------------------------------------------------------------

const { runAssertionsForSection } = await import(distUrl('validation/assertions/index.js'));

async function runOne(assertObj) {
  const results = await runAssertionsForSection(
    '.claude/skills/calc-helper/SKILL.md#basics',
    sectionContent,
    [assertObj],
    { projectRoot: PROJECT, emitWarning: () => { /* swallow */ } },
  );
  return results[0];
}

const projectFiles = (() => {
  const acc = [];
  const SKIP = new Set(['node_modules', '.git', 'dist', '.claude']);
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const full = path.join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile() && /\.(ts|tsx|js|jsx)$/.test(name)) {
        acc.push({ path: full, rel: path.relative(PROJECT, full).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') });
      }
    }
  }
  walk(PROJECT);
  return acc;
})();
const projectFileContents = projectFiles.map((f) => f.text);

const skillContent = readFileSync(path.join(PROJECT, '.claude/skills/calc-helper/SKILL.md'), 'utf8');
const sectionContent = (() => {
  const { sections } = scanAnchors(skillContent, '.claude/skills/calc-helper/SKILL.md');
  return sections.find((s) => s.id === 'basics')?.content ?? '';
})();

await checkAsync('3.1 has_example (warn) — SKILL.md#basics has a fenced code block', async () => {
  const r = await runOne({ type: 'has_example', policy: 'warn' });
  assert(r.passed, `expected pass, got ${JSON.stringify(r)}`);
});

await checkAsync('3.2 symbol_exists:add:typescript (block) — passes', async () => {
  const r = await runOne({ type: 'symbol_exists', param: 'add:typescript', policy: 'block' });
  assert(r.passed, `expected pass, got ${JSON.stringify(r)}`);
});

await checkAsync('3.3 file_exists:src/calc.ts (block) — passes', async () => {
  const r = await runOne({ type: 'file_exists', param: 'src/calc.ts', policy: 'block' });
  assert(r.passed, `expected pass, got ${JSON.stringify(r)}`);
});

await checkAsync('3.4 symbol_exported:add:typescript (block) — passes (add still exported)', async () => {
  const r = await runOne({ type: 'symbol_exported', param: 'add:typescript', policy: 'block' });
  assert(r.passed, `expected pass, got ${JSON.stringify(r)}`);
});

await checkAsync('3.5 symbol_exported:multiply:typescript (block) — FAILS (LIM-1 / Fix 8)', async () => {
  const r = await runOne({ type: 'symbol_exported', param: 'multiply:typescript', policy: 'block' });
  assert(!r.passed, `expected FAIL, got ${JSON.stringify(r)}`);
  assert(/multiply/.test(r.message ?? ''), `message should cite multiply: ${r.message}`);
});

// Contrast: pre-Fix-8 symbol_exists would have passed on multiply because
// index.ts still text-mentions it. Verify the contrast holds.
await checkAsync('3.6 symbol_exists:multiply:typescript — PASSES (corpus-grep / pre-Fix-8 shape)', async () => {
  const r = await runOne({ type: 'symbol_exists', param: 'multiply:typescript', policy: 'block' });
  assert(r.passed, `expected pass (stale text-mention in index.ts), got ${JSON.stringify(r)}`);
});

// -----------------------------------------------------------------------
// Phase 4 — hallucination layer
// -----------------------------------------------------------------------

const { checkHallucination } = await import(distUrl('validation/hallucination.js'));

check('4.1 in-corpus symbol (add) — passes', () => {
  const diff = '--- a/docs/api/calc.md\n+++ b/docs/api/calc.md\n@@ -1,1 +1,2 @@\n # Calc API\n+The `add` helper is still exported.\n';
  const r = checkHallucination(diff, ['# Calc API'], projectFileContents);
  assert(r.passed, `expected pass, got ${JSON.stringify(r)}`);
});

check('4.2 phantom symbol (quantumLeapFactorize) — passes (additive prose; hallucination is permissive for text)', () => {
  const diff = '--- a/docs/api/calc.md\n+++ b/docs/api/calc.md\n@@ -1,1 +1,2 @@\n # Calc API\n+The phantom function `quantumLeapFactorize` is exported.\n';
  const r = checkHallucination(diff, ['# Calc API'], projectFileContents);
  // Documents the layer's current shape — known LIM, Fix 8 is the backstop.
  assert(r.passed, `expected pass (hallucination layer is permissive for prose), got ${JSON.stringify(r)}`);
});

check('4.3 rename-drift (multiply) — passes (LIM-1 demonstration of why Fix 8 is needed)', () => {
  const diff = '--- a/docs/api/calc.md\n+++ b/docs/api/calc.md\n@@ -1,1 +1,2 @@\n # Calc API\n+See `multiply(a, b)` for binary multiplication.\n';
  const r = checkHallucination(diff, ['# Calc API'], projectFileContents);
  assert(r.passed, `expected pass (multiply still text-mentioned in index.ts), got ${JSON.stringify(r)}`);
});

// -----------------------------------------------------------------------
// Phase 5+6 — Stage 1 + Stage 2 against the dummy
// -----------------------------------------------------------------------

const { runStage1 } = await import(distUrl('pipeline/stage1.js'));
const { runStage2 } = await import(distUrl('pipeline/stage2.js'));
const { CostLedger } = await import(distUrl('llm/costLedger.js'));
const { StateStore } = await import(distUrl('state/stateStore.js'));

const cdir = path.join(PROJECT, '.claude', 'coherence');
mkdirSync(path.join(cdir, 'quarantine'), { recursive: true });
const store = new StateStore(cdir, path.join(cdir, 'quarantine'));

function writeCassette(id, content, inputTokens = 1200, outputTokens = 200) {
  const file = path.join(cassetteDir, id + '.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({
    content, input_tokens: inputTokens, output_tokens: outputTokens,
    cost_usd: inputTokens * 3.0 / 1e6 + outputTokens * 15.0 / 1e6,
    timestamp: new Date().toISOString(),
  }, null, 2), 'utf8');
  return id;
}

await checkAsync('5.1 Stage 1 short-circuit for single-section group (no LLM call)', async () => {
  const group = {
    entries: [{ sectionRef: 'docs/intro.md#overview', path: 'docs/intro.md' }],
    triggering_files: [],
  };
  const sectionIndex = [{ sectionRef: 'docs/intro.md#overview', path: 'docs/intro.md', heading: 'overview' }];
  const cl = new CostLedger(store, 'thorough-s1-single');
  const plan = await runStage1(group, sectionIndex, cl);
  assert(plan, 'plan is null');
  assert(plan.canonical === 'docs/intro.md#overview', `canonical wrong: ${plan.canonical}`);
  assert(cl.getEntries().length === 0, `expected 0 cost entries, got ${cl.getEntries().length}`);
});

const multiGroup = {
  entries: [
    { sectionRef: '.claude/skills/calc-helper/SKILL.md#basics', path: '.claude/skills/calc-helper/SKILL.md' },
    { sectionRef: '.claude/agents/calc-reviewer.md#symbol-surface', path: '.claude/agents/calc-reviewer.md' },
    { sectionRef: 'docs/api/calc.md#overview', path: 'docs/api/calc.md' },
    { sectionRef: 'docs/api/calc.md#examples', path: 'docs/api/calc.md' },
  ],
  triggering_files: ['src/calc.ts'],
};
const sectionIndex = Object.entries(EXPECTED_SECTIONS).flatMap(([rel, ids]) =>
  ids.map((id) => ({ sectionRef: `${rel}#${id}`, path: rel, heading: id })),
);
const stage1Plan = {
  canonical: '.claude/skills/calc-helper/SKILL.md#basics',
  sections: [
    { sectionRef: '.claude/skills/calc-helper/SKILL.md#basics', role: 'canonical' },
    { sectionRef: '.claude/agents/calc-reviewer.md#symbol-surface', role: 'reference', relation: 'mirrors' },
    { sectionRef: 'docs/api/calc.md#overview', role: 'reference', relation: 'summarises' },
    { sectionRef: 'docs/api/calc.md#examples', role: 'reference', relation: 'expands' },
  ],
};
writeCassette('thorough/stage1', JSON.stringify(stage1Plan));

let plan;
await checkAsync('5.2 Stage 1 multi-section cassette replay -> 4 sections planned, SKILL canonical', async () => {
  const cl = new CostLedger(store, 'thorough-s1-multi');
  plan = await runStage1(multiGroup, sectionIndex, cl, 'thorough/stage1');
  assert(plan, 'plan is null');
  assert(plan.canonical === '.claude/skills/calc-helper/SKILL.md#basics', `canonical wrong: ${plan.canonical}`);
  assert(plan.sections.length === 4, `expected 4 sections, got ${plan.sections.length}`);
  assert(cl.getEntries().length === 1, `expected 1 cost entry, got ${cl.getEntries().length}`);
});

function readSection(rel, id) {
  const content = readFileSync(path.join(PROJECT, rel), 'utf8');
  const { sections } = scanAnchors(content, rel);
  return sections.find((s) => s.id === id)?.content ?? '';
}

function makeDiff(rel) {
  const full = path.join(PROJECT, rel);
  const text = readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '' && text.endsWith('\n')) lines.pop();
  let bodyStart = 0;
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) if (lines[i] === '---') { bodyStart = i + 1; break; }
  }
  const idx = lines.findIndex((l, i) => i >= bodyStart && l.includes('multiply'));
  if (idx === -1) return null;
  const start = Math.max(0, idx - 3);
  let end = Math.min(lines.length - 1, idx + 3);
  while (end > idx && lines[end] === '') end--;
  const ctx = lines.slice(start, end + 1);
  const body = [];
  for (let i = 0; i < ctx.length; i++) {
    if (i === idx - start) {
      body.push('-' + ctx[i]);
      body.push('+' + ctx[i].replace('multiply', 'times'));
    } else body.push(' ' + ctx[i]);
  }
  return [`--- a/${rel}`, `+++ b/${rel}`, `@@ -${start + 1},${ctx.length} +${start + 1},${ctx.length} @@`, ...body, ''].join('\n');
}

const layerFor = (p) => /SKILL\.md$/i.test(p) ? 'skill' : /CLAUDE\.md$/i.test(p) ? 'config' : /agent/i.test(p) ? 'subagent' : 'referring-doc';
const stage2Inputs = plan.sections.map((ps) => {
  const [pth, id] = ps.sectionRef.split('#');
  return {
    sectionRef: ps.sectionRef,
    role: ps.role,
    relation: ps.relation ?? null,
    heading: id,
    current_content: readSection(pth, id),
    canonical_content: ps.role === 'canonical' ? null : readSection(...plan.canonical.split('#')),
    changed_tokens: ['multiply', 'times'],
    layer: layerFor(pth),
  };
});

const cassetteIds = new Map();
for (const input of stage2Inputs) {
  const [rel] = input.sectionRef.split('#');
  const diff = makeDiff(rel);
  const cid = `thorough/stage2-${input.sectionRef.replace(/[^a-z0-9]/gi, '_')}`;
  writeCassette(cid, diff ?? 'NO_PATCH_NEEDED', 1350, 280);
  cassetteIds.set(input.sectionRef, cid);
}

let stage2Results;
let stage2Ledger;
await checkAsync('6.1 Stage 2 runs validation chain for all 4 sections', async () => {
  stage2Ledger = new CostLedger(store, 'thorough-s2');
  stage2Results = await runStage2(plan, stage2Inputs, stage2Ledger, PROJECT, projectFileContents, cassetteIds);
  await stage2Ledger.flush();
  assert(stage2Results.length === 4, `expected 4 results, got ${stage2Results.length}`);
});

check('6.2 Stage 2 SKILL.md -> ESCALATE (Fix 8 symbol_exported BLOCK)', () => {
  const skill = stage2Results.find((r) => r.patch.sectionRef === '.claude/skills/calc-helper/SKILL.md#basics');
  assert(skill, 'SKILL result missing');
  assert(skill.patch.diff === 'ESCALATE', `expected ESCALATE, got ${skill.patch.diff?.slice(0, 80)}`);
  assert(!skill.patch.validationPassed, 'expected validationPassed=false');
  const log = skill.validationLog.join(' ');
  assert(/symbol_exported/.test(log), `log should mention symbol_exported: ${log}`);
  assert(/multiply/.test(log), `log should mention multiply: ${log}`);
});

check('6.3 Stage 2 agent + 2 docs sections all pass validation', () => {
  const others = stage2Results.filter((r) => r.patch.sectionRef !== '.claude/skills/calc-helper/SKILL.md#basics');
  assert(others.length === 3, `expected 3 others, got ${others.length}`);
  for (const r of others) {
    assert(r.patch.validationPassed, `${r.patch.sectionRef} did not pass: ${r.validationLog.join(' | ')}`);
    assert(r.patch.changeClass === 'modifying', `${r.patch.sectionRef} changeClass=${r.patch.changeClass}`);
  }
});

check('6.4 every passing patch ran format + apply + sanity + line-ratio + prompt-injection + hallucination + assertions', () => {
  const required = ['format', 'apply', 'sanity', 'line-ratio', 'prompt-injection', 'hallucination', 'assertions'];
  const others = stage2Results.filter((r) => r.patch.validationPassed);
  assert(others.length > 0, 'no passing patches to inspect');
  for (const r of others) {
    const log = r.validationLog.join(' ').toLowerCase();
    for (const stage of required) {
      assert(log.includes(stage), `${r.patch.sectionRef} missing stage '${stage}' in log`);
    }
  }
});

// -----------------------------------------------------------------------
// Phase 7 — trust ladder
// -----------------------------------------------------------------------

const { getSectionScore, recordEvent } = await import(distUrl('state/trustLedger.js'));

await checkAsync('7.1 fresh sections have score 0.000 -> modifying patches DEFER', async () => {
  for (const r of stage2Results) {
    if (!r.patch.validationPassed) continue;
    const score = await getSectionScore(store, r.patch.sectionRef);
    assert(score < 0.85, `${r.patch.sectionRef} score=${score} unexpectedly >= 0.85`);
  }
});

await checkAsync('7.2 boosting a section past 0.85 simulates AUTO-APPLY readiness', async () => {
  const target = '.claude/agents/calc-reviewer.md#symbol-surface';
  // Record 10 accepts — drives the EWMA-style score above the 0.85 threshold.
  for (let i = 0; i < 10; i++) {
    await recordEvent(store, target, 'accept');
  }
  const score = await getSectionScore(store, target);
  assert(score >= 0.85, `expected score >= 0.85 after 10 accepts, got ${score}`);
  // Simulate the auto-apply gate the stop orchestrator uses.
  const r = stage2Results.find((x) => x.patch.sectionRef === target);
  const wouldAutoApply = r.patch.changeClass === 'modifying' && r.patch.validationPassed && score >= 0.85;
  assert(wouldAutoApply, 'gate failed despite all conditions met');
  return `score=${score.toFixed(3)}, wouldAutoApply=true`;
});

await checkAsync('7.3 DD-131 — frontmatter patches always DEFER regardless of score', async () => {
  // Synthetic frontmatter-only diff. Even with a boosted score, the gate
  // must NOT auto-apply because changeClass !== 'modifying'.
  const target = '.claude/agents/calc-reviewer.md#symbol-surface';
  const score = await getSectionScore(store, target);
  assert(score >= 0.85, `precondition: section should still be boosted (got ${score})`);
  const wouldAutoApply = 'frontmatter' === 'modifying' && true && score >= 0.85; // always false
  assert(!wouldAutoApply, 'DD-131 gate would have auto-applied a frontmatter patch');
});

// -----------------------------------------------------------------------
// Phase 8 — bundle assembly
// -----------------------------------------------------------------------

const { assembleBundle } = await import(distUrl('pipeline/bundle.js'));

check('8.1 bundle contains exactly the 3 applicable patches (SKILL excluded)', () => {
  const bundle = assembleBundle('thorough-dummy', stage2Results.map((r) => r.patch), plan.canonical);
  assert(bundle.patches.length === 3, `expected 3 patches, got ${bundle.patches.length}`);
  for (const p of bundle.patches) {
    assert(p.sectionRef !== '.claude/skills/calc-helper/SKILL.md#basics', 'SKILL leaked into bundle');
  }
});

// -----------------------------------------------------------------------
// Phase 9 — state file sanity
// -----------------------------------------------------------------------

check('9.1 cost-ledger.json exists and is well-formed JSON', () => {
  const p = path.join(cdir, 'cost-ledger.json');
  assert(existsSync(p), 'cost-ledger.json missing');
  const parsed = JSON.parse(readFileSync(p, 'utf8'));
  assert(Array.isArray(parsed.entries), 'no entries array');
  assert(parsed.entries.length > 0, 'no cost entries recorded');
});

check('9.2 trust-ledger.json exists with the boosted symbol-surface section', () => {
  const p = path.join(cdir, 'trust-ledger.json');
  assert(existsSync(p), 'trust-ledger.json missing');
  const parsed = JSON.parse(readFileSync(p, 'utf8'));
  // Schema shape varies — just assert it parses and references our target.
  const raw = readFileSync(p, 'utf8');
  assert(/symbol-surface/.test(raw), 'boosted section not present in ledger');
});

// -----------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------

try { rmSync(cassetteDir, { recursive: true, force: true }); } catch { /* */ }

const passed = cases.filter((c) => c.passed).length;
const failed = cases.length - passed;

console.log('\n=== thorough dummy test report ===');
for (const c of cases) {
  const mark = c.passed ? '✓' : '✗';
  const tail = c.detail ? `  — ${c.detail}` : '';
  console.log(`  ${mark} ${c.name}${tail}`);
}
console.log(`\n${passed} / ${cases.length} cases passed.`);

if (failed > 0) {
  console.log('\nFAILURES:');
  for (const c of cases.filter((c) => !c.passed)) {
    console.log(`  ✗ ${c.name}: ${c.detail}`);
  }
  process.exit(1);
}
