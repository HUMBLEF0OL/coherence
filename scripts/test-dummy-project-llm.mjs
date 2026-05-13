#!/usr/bin/env node
/**
 * LLM-layer test against the cohrence-dummy fixture. Exercises:
 *   - Stage 1 cassette replay (single-section short-circuit path AND
 *     multi-section group with canonical assignment)
 *   - Stage 2 cassette replay through the 7-stage validation chain
 *   - Frontmatter-driven asserts (SKILL.md declares `has_example`,
 *     `symbol_exists:add:typescript`, `file_exists:src/calc.ts`)
 *   - Hallucination check on a renamed symbol (`multiply` → `times`)
 *   - Trust ladder evaluation
 *   - Bundle assembly
 *
 * Requires: dummy project at `E:/Projects and Learning/cohrence-dummy/`
 * already seeded with `--with-drift` (see scripts/setup-dummy-project.mjs).
 */
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT = 'E:/Projects and Learning/cohrence-dummy';
const COH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COH_DIST = path.join(COH_ROOT, 'dist');
const distUrl = (rel) => pathToFileURL(path.join(COH_DIST, rel)).href;

const cassetteDir = mkdtempSync(path.join(os.tmpdir(), 'cohrence-dummy-llm-'));
process.env['COHERENCE_CASSETTES_DIR'] = cassetteDir;
delete process.env['ANTHROPIC_API_KEY'];

console.log(`\n=== coherence LLM smoke against ${PROJECT} ===`);
console.log(`Cassette dir: ${cassetteDir}\n`);

const { scanAnchors } = await import(distUrl('detection/anchorScanner.js'));
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.claude/coherence']);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (full.includes('.claude') && full.includes('coherence')) continue;
      walk(full, acc);
    }
    else if (st.isFile() && /\.(md|ts|tsx|js|jsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

const files = walk(PROJECT);
const anchored = [];
for (const f of files) {
  const rel = path.relative(PROJECT, f).replace(/\\/g, '/');
  let content; try { content = readFileSync(f, 'utf8'); } catch { continue; }
  if (!content.includes('coherence:section')) continue;
  const { sections } = scanAnchors(content, rel);
  if (sections.length > 0) anchored.push({ path: rel, sections });
}
const projectFileContents = [];
for (const f of files) {
  const rel = path.relative(PROJECT, f).replace(/\\/g, '/');
  if (/\.(ts|tsx|js|jsx)$/.test(f) && !rel.startsWith('.claude/')) {
    try { projectFileContents.push(readFileSync(f, 'utf8')); } catch { /* */ }
  }
}
console.log(`Phase 0: anchored files=${anchored.length}, source files=${projectFileContents.length}\n`);
for (const a of anchored) {
  for (const s of a.sections) console.log(`  ${a.path}#${s.id} (lines ${s.lineStart}..${s.lineEnd})`);
}

const { runStage1 } = await import(distUrl('pipeline/stage1.js'));
const { runStage2 } = await import(distUrl('pipeline/stage2.js'));
const { CostLedger } = await import(distUrl('llm/costLedger.js'));
const { StateStore } = await import(distUrl('state/stateStore.js'));
const { getSectionScore } = await import(distUrl('state/trustLedger.js'));
const { assembleBundle } = await import(distUrl('pipeline/bundle.js'));
const { checkHallucination } = await import(distUrl('validation/hallucination.js'));

const cdir = path.join(PROJECT, '.claude', 'coherence');
mkdirSync(cdir, { recursive: true });
mkdirSync(path.join(cdir, 'quarantine'), { recursive: true });
const ledgerStore = new StateStore(cdir, path.join(cdir, 'quarantine'));

// Helpers ----------------------------------------------------------------

function readSection(rel, id) {
  const content = readFileSync(path.join(PROJECT, rel), 'utf8');
  const { sections } = scanAnchors(content, rel);
  return sections.find((s) => s.id === id)?.content ?? '';
}
const layerFor = (p) => /SKILL\.md$/i.test(p) ? 'skill' : /CLAUDE\.md$/i.test(p) ? 'config' : /agent/i.test(p) ? 'subagent' : 'referring-doc';

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

function makeDiffForLine(rel, oldSubstr, newSubstr) {
  const full = path.join(PROJECT, rel);
  const lines = readFileSync(full, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const idx = lines.findIndex((l) => l.includes(oldSubstr));
  if (idx === -1) return null;
  const start = Math.max(0, idx - 3);
  const end = Math.min(lines.length - 1, idx + 3);
  const ctx = lines.slice(start, end + 1);
  const body = [];
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

// Phase A: Stage 1 short-circuit for single-section group ----------------

console.log('\n--- Phase A: Stage 1 short-circuit (single-section group) ---');
{
  const singleGroup = {
    entries: [{ sectionRef: 'docs/intro.md#overview', path: 'docs/intro.md' }],
    triggering_files: [],
  };
  const sectionIndex = [{
    sectionRef: 'docs/intro.md#overview', path: 'docs/intro.md', heading: 'overview',
  }];
  const costLedger = new CostLedger(ledgerStore, 'dummy-stage1-single');
  const plan = await runStage1(singleGroup, sectionIndex, costLedger);
  console.log('plan =', JSON.stringify(plan));
  console.log('cost-ledger entries =', costLedger.getEntries().length, '(expected 0 — short-circuit)');
}

// Phase B: Stage 1 cassette replay for multi-section group ---------------

console.log('\n--- Phase B: Stage 1 multi-section group (cassette replay) ---');
const multiGroup = {
  entries: [
    { sectionRef: '.claude/skills/calc-helper/SKILL.md#basics', path: '.claude/skills/calc-helper/SKILL.md' },
    { sectionRef: '.claude/agents/calc-reviewer.md#symbol-surface', path: '.claude/agents/calc-reviewer.md' },
    { sectionRef: 'docs/api/calc.md#overview', path: 'docs/api/calc.md' },
    { sectionRef: 'docs/api/calc.md#examples', path: 'docs/api/calc.md' },
  ],
  triggering_files: ['src/calc.ts'],
};
const sectionIndex = anchored.flatMap((a) => a.sections.map((s) => ({
  sectionRef: `${a.path}#${s.id}`, path: a.path, heading: s.id,
})));
const stage1Plan = {
  canonical: '.claude/skills/calc-helper/SKILL.md#basics',
  sections: [
    { sectionRef: '.claude/skills/calc-helper/SKILL.md#basics', role: 'canonical' },
    { sectionRef: '.claude/agents/calc-reviewer.md#symbol-surface', role: 'reference', relation: 'mirrors' },
    { sectionRef: 'docs/api/calc.md#overview', role: 'reference', relation: 'summarises' },
    { sectionRef: 'docs/api/calc.md#examples', role: 'reference', relation: 'expands' },
  ],
};
const s1Id = writeCassette('dummy/stage1', JSON.stringify(stage1Plan));
const cl1 = new CostLedger(ledgerStore, 'dummy-stage1-multi');
const plan = await runStage1(multiGroup, sectionIndex, cl1, s1Id);
console.log('plan canonical =', plan?.canonical);
console.log('plan sections  =', plan?.sections.length);
console.log('cost-ledger    =', cl1.getEntries().length, 'entry · $' + cl1.totalCostUsd().toFixed(6));

// Phase C: Stage 2 — patch `multiply` → `times` in each section ----------

console.log('\n--- Phase C: Stage 2 validation chain (cassette replay) ---');
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
  if (input.role === 'no-change') continue;
  const [rel] = input.sectionRef.split('#');
  const diff = makeDiffForLine(rel, 'multiply', 'times');
  const cid = `dummy/stage2-${input.sectionRef.replace(/[^a-z0-9]/gi, '_')}`;
  if (diff) writeCassette(cid, diff, 1350, 280);
  else writeCassette(cid, 'NO_PATCH_NEEDED', 500, 5);
  cassetteIds.set(input.sectionRef, cid);
}

const cl2 = new CostLedger(ledgerStore, 'dummy-stage2');
const results = await runStage2(plan, stage2Inputs, cl2, PROJECT, projectFileContents, cassetteIds);
for (const r of results) {
  console.log(`\nSection ${r.patch.sectionRef}:`);
  console.log(`  changeClass      = ${r.patch.changeClass}`);
  console.log(`  validationPassed = ${r.patch.validationPassed}`);
  console.log(`  diff             = ${r.patch.diff === 'NO_PATCH_NEEDED' || r.patch.diff === 'ESCALATE' ? r.patch.diff : `(${r.patch.diff.length} chars)`}`);
  for (const l of r.validationLog) console.log(`    - ${l}`);
}
console.log(`\nStage 2 cost: ${cl2.getEntries().length} entries · $${cl2.totalCostUsd().toFixed(6)}`);

// Phase D: trust ladder + bundle assembly --------------------------------

console.log('\n--- Phase D: trust-ladder + bundle assembly ---');
for (const r of results) {
  if (r.patch.diff === 'NO_PATCH_NEEDED' || r.patch.diff === 'ESCALATE') continue;
  const score = await getSectionScore(ledgerStore, r.patch.sectionRef);
  const auto = r.patch.changeClass === 'modifying' && r.patch.validationPassed && score >= 0.85;
  console.log(`  ${r.patch.sectionRef}: score=${score.toFixed(3)} class=${r.patch.changeClass} → ${auto ? 'AUTO-APPLY' : 'DEFER'}`);
}
const bundle = assembleBundle('dummy-calc-rename', results.map((r) => r.patch), plan.canonical);
console.log(`Bundle ${bundle.bundle_id}: ${bundle.patches.length} applicable patch(es)`);
console.log(`  summary: ${bundle.summary}`);

// Phase E: hallucination — novel symbol that doesn't exist anywhere ------

console.log('\n--- Phase E: hallucination on a truly novel symbol ---');
{
  const diff = [
    '--- a/docs/api/calc.md',
    '+++ b/docs/api/calc.md',
    '@@ -1,1 +1,2 @@',
    ' # Calc API',
    '+The phantom function `quantumLeapFactorize` is now exported.',
    '',
  ].join('\n');
  const r = checkHallucination(diff, ['# Calc API'], projectFileContents);
  console.log(`  passed              = ${r.passed}`);
  console.log(`  unknownStrictTokens = ${JSON.stringify(r.unknownStrictTokens)}`);
  console.log(`  unknownLooseTokens  = ${JSON.stringify(r.unknownLooseOnlyTokens)}`);
}

// Phase F: hallucination on the renamed symbol (LIM-1 demonstration) -----

console.log('\n--- Phase F: hallucination on the rename drift (LIM-1) ---');
{
  let textualOccurrences = 0;
  for (const c of projectFileContents) if (c.includes('multiply')) textualOccurrences++;
  console.log(`  textual occurrences of 'multiply' in source corpus: ${textualOccurrences}`);
  // The rename moved multiply → times in src/calc.ts. With only calc.ts +
  // index.ts in the corpus, 'multiply' should appear in 0-1 of them
  // (index.ts re-exports it but the rename leaves it broken).
  const diff = [
    '--- a/docs/api/calc.md',
    '+++ b/docs/api/calc.md',
    '@@ -1,1 +1,2 @@',
    ' # Calc API',
    '+See `multiply(a, b)` for the rename target.',
    '',
  ].join('\n');
  const r = checkHallucination(diff, ['# Calc API'], projectFileContents);
  console.log(`  passed              = ${r.passed}`);
  console.log(`  unknownStrictTokens = ${JSON.stringify(r.unknownStrictTokens)}`);
}

try { rmSync(cassetteDir, { recursive: true, force: true }); } catch { /* */ }
console.log('\n=== LLM smoke complete ===\n');
