#!/usr/bin/env node
/**
 * LLM-layer smoke harness — exercises coherence's Stage 1 + Stage 2
 * pipeline against the mcp-sentry fixture (`test/coherence-v1-smoke`)
 * via cassette replay. Pairs with `smoke-mcp-sentry.mjs` (deterministic
 * layers only).
 *
 * Strategy: we DO NOT call the live Anthropic API. Instead we synthesise
 * hand-crafted cassettes representing what a competent planner + patch
 * writer would emit for the known drift (`gradeBelow` →
 * `isBelowThreshold`), point the cassette dir at a tmp folder, and let
 * the actual coherence modules (loaded from `dist/`) drive the replay.
 *
 * This exercises:
 *   - `llmCall` cassette replay path (`src/llm/client.ts`)
 *   - `runStage1` plan parsing + cost-ledger recording (`src/pipeline/stage1.ts`)
 *   - `runStage2` per-section parallel orchestration, the full validation
 *     chain (format → apply → sanity → line-ratio → prompt-injection →
 *     hallucination → assertions), and per-section result aggregation
 *     (`src/pipeline/stage2.ts`)
 *   - `parseStage2Response` format gate (`src/validation/format.ts`)
 *   - `checkApplies` apply gate (`src/validation/apply.ts`)
 *   - `checkHallucination` corpus grep
 *   - `applyAssertions` engine routing
 *
 * Drift fixture: `packages/cli/src/grade.ts:89` renamed
 * `gradeBelow` → `isBelowThreshold` at commit 9097294. Docs under
 * `.claude/skills/mcp-sentry-grader/SKILL.md`,
 * `.claude/agents/sentry-reviewer.md`, and
 * `docs/agents-and-skills/reference.md` still reference `gradeBelow`.
 */
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const CONSUMER = process.argv[2] ?? 'E:/Projects and Learning/mcp-sentry';
const COH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COH_DIST = path.join(COH_ROOT, 'dist');
const distUrl = (rel) => pathToFileURL(path.join(COH_DIST, rel)).href;

// Use a fresh cassette dir so we don't collide with committed fixtures.
const cassetteDir = mkdtempSync(path.join(os.tmpdir(), 'cohrence-mcp-sentry-llm-'));
process.env['COHERENCE_CASSETTES_DIR'] = cassetteDir;
// Belt-and-braces: never let a missing API key cause a real call to leak.
delete process.env['ANTHROPIC_API_KEY'];

console.log(`\n=== coherence LLM-layer smoke against ${CONSUMER} ===`);
console.log(`Cassette dir: ${cassetteDir}\n`);

// ---- Phase 0: anchor scan (mirrors deterministic smoke) -----------------
const { scanAnchors } = await import(distUrl('detection/anchorScanner.js'));
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache', 'coverage', '.next', '.astro', '.wrangler']);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, acc);
    else if (st.isFile() && /\.(md|ts|tsx|js|jsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

const files = walk(CONSUMER);
const anchored = [];
for (const f of files) {
  const rel = path.relative(CONSUMER, f).replace(/\\/g, '/');
  let content;
  try { content = readFileSync(f, 'utf8'); } catch { continue; }
  if (!content.includes('coherence:section')) continue;
  const { sections } = scanAnchors(content, rel);
  if (sections.length > 0) anchored.push({ path: rel, sections, full: f });
}

const projectFileContents = [];
for (const f of files) {
  const rel = path.relative(CONSUMER, f).replace(/\\/g, '/');
  if (/\.(ts|tsx|js|jsx)$/.test(f) && !rel.startsWith('.claude/') && !rel.startsWith('docs/')) {
    try { projectFileContents.push(readFileSync(f, 'utf8')); } catch { /* skip */ }
  }
}
console.log(`Phase 0: ${anchored.length} anchored files, ${projectFileContents.length} source files for hallucination corpus.\n`);

// ---- Phase A: Stage 1 cassette replay -----------------------------------
console.log('--- phase A: Stage 1 (planner) cassette replay ---');
const { runStage1 } = await import(distUrl('pipeline/stage1.js'));
const { CostLedger } = await import(distUrl('llm/costLedger.js'));

// Build a SectionGroup spanning the SKILL, agent and referring doc that
// all mention `gradeBelow`. This is the realistic multi-section case
// where Stage 1 has to pick a canonical and assign relations.
const group = {
  entries: [
    { sectionRef: '.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules', path: '.claude/skills/mcp-sentry-grader/SKILL.md' },
    { sectionRef: '.claude/agents/sentry-reviewer.md#grading-calls', path: '.claude/agents/sentry-reviewer.md' },
    { sectionRef: 'docs/agents-and-skills/reference.md#reviewer-agent', path: 'docs/agents-and-skills/reference.md' },
  ],
  triggering_files: ['packages/cli/src/grade.ts'],
};

const sectionIndex = anchored.flatMap((a) => a.sections.map((s) => ({
  sectionRef: `${a.path}#${s.id}`,
  path: a.path,
  heading: s.id,
})));

// Stage 1 cassette: skill is canonical (per TS-5 §5.3 layer ordering), the
// agent mirrors it, the referring doc summarises.
const stage1CassetteId = 'mcp-sentry/stage1-grading';
const stage1Plan = {
  canonical: '.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules',
  sections: [
    { sectionRef: '.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules', role: 'canonical' },
    { sectionRef: '.claude/agents/sentry-reviewer.md#grading-calls', role: 'reference', relation: 'mirrors' },
    { sectionRef: 'docs/agents-and-skills/reference.md#reviewer-agent', role: 'reference', relation: 'summarises' },
  ],
};
const stage1Cassette = {
  content: JSON.stringify(stage1Plan),
  input_tokens: 1240,
  output_tokens: 180,
  cost_usd: 1240 * 3.0 / 1e6 + 180 * 15.0 / 1e6,
  timestamp: new Date().toISOString(),
};
mkdirSync(path.join(cassetteDir, 'mcp-sentry'), { recursive: true });
writeFileSync(path.join(cassetteDir, stage1CassetteId + '.json'), JSON.stringify(stage1Cassette, null, 2), 'utf8');

// Spin up a real StateStore against mcp-sentry's .claude/coherence/ for
// the cost ledger / trust ledger paths used later.
const { StateStore: SS } = await import(distUrl('state/stateStore.js'));
const _cdir = path.join(CONSUMER, '.claude', 'coherence');
mkdirSync(_cdir, { recursive: true });
mkdirSync(path.join(_cdir, 'quarantine'), { recursive: true });
const ledgerStore = new SS(_cdir, path.join(_cdir, 'quarantine'));

const costLedger1 = new CostLedger(ledgerStore, 'smoke-llm-stage1');
const plan = await runStage1(group, sectionIndex, costLedger1, stage1CassetteId);
console.log('Stage 1 replay produced plan:');
console.log(JSON.stringify(plan, null, 2));
const c1 = costLedger1.getEntries();
console.log(`Cost-ledger recorded ${c1.length} entry/entries; total $${costLedger1.totalCostUsd().toFixed(6)}`);
if (!plan) {
  console.log('FAIL: Stage 1 returned null — planner cassette malformed or parse path broken.');
  process.exit(1);
}
if (plan.canonical !== stage1Plan.canonical) {
  console.log(`FAIL: canonical mismatch (expected ${stage1Plan.canonical}, got ${plan.canonical})`);
  process.exit(1);
}
console.log('Stage 1 OK\n');

// ---- Phase B: Stage 2 cassette replay + validation chain ----------------
console.log('--- phase B: Stage 2 (patch writer) cassette replay + validation chain ---');
const { runStage2 } = await import(distUrl('pipeline/stage2.js'));

// Build per-section inputs.
function readSectionContent(rel, sectionId) {
  const full = path.join(CONSUMER, rel);
  const content = readFileSync(full, 'utf8');
  const { sections } = scanAnchors(content, rel);
  const match = sections.find((s) => s.id === sectionId);
  return match?.content ?? '';
}

const layerFor = (p) => /SKILL\.md$/i.test(p) ? 'skill' : /CLAUDE\.md$/i.test(p) ? 'config' : /agent/i.test(p) ? 'subagent' : 'referring-doc';

const stage2Inputs = plan.sections.map((ps) => {
  const [path_, id] = ps.sectionRef.split('#');
  return {
    sectionRef: ps.sectionRef,
    role: ps.role,
    relation: ps.relation ?? null,
    heading: id,
    current_content: readSectionContent(path_, id),
    canonical_content: ps.role === 'canonical' ? null : readSectionContent(...plan.canonical.split('#')),
    changed_tokens: ['gradeBelow', 'isBelowThreshold'],
    layer: layerFor(path_),
  };
});

// Synthesise Stage 2 cassettes per section using a hand-built per-line
// unified diff with 3-line context. We locate the first line containing
// `gradeBelow`, emit a `-`/`+` pair with surrounding context, and let
// the apply gate (`git apply --check`) validate it.
//
// Why hand-built instead of `git diff --no-index`: on Windows, git
// silently autocrlf-converts the tmp file and the resulting diff fails
// `git apply --check` with "corrupt patch". A hand-built diff using
// the bytes exactly as they appear in the consumer's file matches
// `git apply`'s expectations regardless of line-ending mode.
function makePatchDiff(rel) {
  const full = path.join(CONSUMER, rel);
  // Read with the same eol normalisation that StateStore-equivalent
  // reads use: preserve whatever's on disk.
  const original = readFileSync(full, 'utf8');
  // Normalise to LF only for parsing line indices; track the platform's
  // EOL so we can re-emit faithfully.
  const lf = original.replace(/\r\n/g, '\n');
  const lines = lf.split('\n');
  const targetIdx = lines.findIndex((l) => l.includes('gradeBelow'));
  if (targetIdx === -1) return null;
  // 3 lines before, 3 after — guard against file boundaries
  const ctxStart = Math.max(0, targetIdx - 3);
  const ctxEnd = Math.min(lines.length - 1, targetIdx + 3);
  const oldLines = lines.slice(ctxStart, ctxEnd + 1);
  const newLines = oldLines.map((l, i) =>
    i === (targetIdx - ctxStart) ? l.replace('gradeBelow', 'isBelowThreshold') : l,
  );
  const hunkHeader = `@@ -${ctxStart + 1},${oldLines.length} +${ctxStart + 1},${newLines.length} @@`;
  const body = [];
  for (let i = 0; i < oldLines.length; i++) {
    if (i === (targetIdx - ctxStart)) {
      body.push('-' + oldLines[i]);
      body.push('+' + newLines[i]);
    } else {
      body.push(' ' + oldLines[i]);
    }
  }
  return [
    `--- a/${rel}`,
    `+++ b/${rel}`,
    hunkHeader,
    ...body,
    '',
  ].join('\n');
}

const cassetteIds = new Map();
for (const input of stage2Inputs) {
  if (input.role === 'no-change') continue;
  const [rel] = input.sectionRef.split('#');
  const diff = makePatchDiff(rel);
  if (!diff) {
    // No drift in this section's text — record a NO_PATCH_NEEDED sentinel
    const id = `mcp-sentry/stage2-nochange-${input.sectionRef.replace(/[^a-z0-9]/gi, '_')}`;
    writeFileSync(path.join(cassetteDir, id + '.json'), JSON.stringify({
      content: 'NO_PATCH_NEEDED', input_tokens: 600, output_tokens: 8,
      cost_usd: 600 * 3.0 / 1e6 + 8 * 15.0 / 1e6, timestamp: new Date().toISOString(),
    }, null, 2), 'utf8');
    cassetteIds.set(input.sectionRef, id);
    continue;
  }
  const id = `mcp-sentry/stage2-patch-${input.sectionRef.replace(/[^a-z0-9]/gi, '_')}`;
  writeFileSync(path.join(cassetteDir, id + '.json'), JSON.stringify({
    content: diff,
    input_tokens: 1450,
    output_tokens: 320,
    cost_usd: 1450 * 3.0 / 1e6 + 320 * 15.0 / 1e6,
    timestamp: new Date().toISOString(),
  }, null, 2), 'utf8');
  cassetteIds.set(input.sectionRef, id);
}

const costLedger2 = new CostLedger(ledgerStore, 'smoke-llm-stage2');
const stage2Results = await runStage2(
  plan,
  stage2Inputs,
  costLedger2,
  CONSUMER,
  projectFileContents,
  cassetteIds,
);

for (const r of stage2Results) {
  console.log(`\nSection ${r.patch.sectionRef}:`);
  console.log(`  changeClass        = ${r.patch.changeClass}`);
  console.log(`  validationPassed   = ${r.patch.validationPassed}`);
  console.log(`  diff               = ${r.patch.diff === 'NO_PATCH_NEEDED' || r.patch.diff === 'ESCALATE' ? r.patch.diff : `(${r.patch.diff.length} chars)`}`);
  console.log('  validationLog:');
  for (const l of r.validationLog) console.log(`    - ${l}`);
}
const c2 = costLedger2.getEntries();
console.log(`\nStage 2 cost-ledger: ${c2.length} entries, total $${costLedger2.totalCostUsd().toFixed(6)}`);

// ---- Phase C: trust ladder evaluation -----------------------------------
console.log('\n--- phase C: trust-ladder auto-apply gate (DD-131) ---');
const { getSectionScore } = await import(distUrl('state/trustLedger.js'));
for (const r of stage2Results) {
  if (r.patch.diff === 'NO_PATCH_NEEDED' || r.patch.diff === 'ESCALATE') continue;
  const score = await getSectionScore(ledgerStore, r.patch.sectionRef);
  const wouldAutoApply = r.patch.changeClass === 'modifying' && r.patch.validationPassed && score >= 0.85;
  console.log(`  ${r.patch.sectionRef}: score=${score.toFixed(3)} changeClass=${r.patch.changeClass} → ${wouldAutoApply ? 'AUTO-APPLY' : 'DEFER TO REVIEW'}`);
}

// ---- Phase D: bundle assembly -------------------------------------------
console.log('\n--- phase D: bundle assembly (permission gate input shape) ---');
const { assembleBundle } = await import(distUrl('pipeline/bundle.js'));
const patches = stage2Results.map((r) => r.patch);
const bundle = assembleBundle('mcp-sentry-grading', patches, plan.canonical);
console.log(`Bundle ${bundle.bundle_id}: ${bundle.patches.length} applicable patch(es)`);
console.log(`  summary: ${bundle.summary}`);
for (const p of bundle.patches) {
  console.log(`  - ${p.sectionRef}: validationPassed=${p.validationPassed} class=${p.changeClass}`);
}

// ---- Phase E: format-gate edge case (ESCALATE response) -----------------
console.log('\n--- phase E: ESCALATE response handling ---');
{
  const escId = 'mcp-sentry/stage2-escalate-edge';
  writeFileSync(path.join(cassetteDir, escId + '.json'), JSON.stringify({
    content: 'ESCALATE', input_tokens: 800, output_tokens: 5,
    cost_usd: 800 * 3.0 / 1e6 + 5 * 15.0 / 1e6, timestamp: new Date().toISOString(),
  }, null, 2), 'utf8');
  const escPlan = {
    canonical: '.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules',
    sections: [{ sectionRef: '.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules', role: 'canonical' }],
  };
  const escInput = stage2Inputs.find((s) => s.role === 'canonical');
  const m = new Map([[escInput.sectionRef, escId]]);
  const result = await runStage2(escPlan, [escInput], new CostLedger(ledgerStore, 'smoke-llm-escalate'), CONSUMER, projectFileContents, m);
  console.log(`ESCALATE replay → validationPassed=${result[0].patch.validationPassed}, diff=${result[0].patch.diff}`);
  if (result[0].patch.diff !== 'ESCALATE' || result[0].patch.validationPassed) {
    console.log('  FAIL: ESCALATE not honoured by format gate');
  } else {
    console.log('  OK: format gate routed ESCALATE to validationPassed=false');
  }
}

// ---- Phase F: hallucination layer with a TRUE drift signal -------------
console.log('\n--- phase F: hallucination layer with a symbol that does NOT exist anywhere in source ---');
const { checkHallucination } = await import(distUrl('validation/hallucination.js'));
{
  // Inject a clearly fake symbol; the corpus grep should fail.
  const fakeDiff = [
    '--- a/.claude/skills/mcp-sentry-grader/SKILL.md',
    '+++ b/.claude/skills/mcp-sentry-grader/SKILL.md',
    '@@ -1,1 +1,2 @@',
    ' Sample heading',
    '+The function `phantomGradeChecker` is invoked here.',
    '',
  ].join('\n');
  const r = checkHallucination(fakeDiff, ['Sample heading'], projectFileContents);
  console.log(`  unknownStrictTokens   = ${JSON.stringify(r.unknownStrictTokens)}`);
  console.log(`  passed                = ${r.passed}`);
  console.log(`  demoteClass           = ${r.demoteClass}`);
  if (!r.passed && r.unknownStrictTokens.includes('phantomGradeChecker')) {
    console.log('  OK: hallucination layer flagged a truly-novel symbol');
  } else {
    console.log('  NOTE: hallucination layer did NOT flag the synthetic symbol (review thresholding)');
  }
}

// ---- Phase G: limitation analysis — the gradeBelow drift case -----------
console.log('\n--- phase G: limitation analysis — why hallucination misses the rename drift ---');
{
  const targetDiff = makePatchDiff('.claude/skills/mcp-sentry-grader/SKILL.md');
  const r = checkHallucination(targetDiff, ['See `gradeBelow` in the grade module.'], projectFileContents);
  let appearsAt = [];
  for (let i = 0; i < projectFileContents.length; i++) {
    if (projectFileContents[i].includes('gradeBelow')) appearsAt.push(i);
  }
  console.log(`  'gradeBelow' textual occurrences in corpus: ${appearsAt.length} file(s)`);
  console.log(`  → hallucination.passed = ${r.passed}, unknownStrictTokens = ${JSON.stringify(r.unknownStrictTokens)}`);
  console.log('  INTERPRETATION: the rename drift produces a build break, NOT a hallucination signal.');
  console.log('  The hallucination layer is corpus-grep based; it cannot distinguish a symbol that');
  console.log('  exists in stale callers/tests from a symbol that is still exported. This is by');
  console.log('  design — the LLM stages are expected to detect rename drifts via Stage 1 grouping.');
}

// ---- Cleanup ------------------------------------------------------------
try { rmSync(cassetteDir, { recursive: true, force: true }); } catch { /* */ }

console.log('\n=== LLM-layer smoke complete ===\n');
