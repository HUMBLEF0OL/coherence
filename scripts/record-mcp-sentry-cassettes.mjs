#!/usr/bin/env node
/**
 * v1.0.2 M2 — record real Stage 1 + Stage 2 cassettes against the
 * mcp-sentry fixture.
 *
 * Unlike `smoke-mcp-sentry-llm.mjs` (which SYNTHESISES hand-crafted
 * cassettes for replay-only smoke testing), this script invokes the
 * actual LLM via the Claude Agent SDK using your authenticated
 * `claude` CLI subscription, and writes the responses to
 * `tests/cassettes/mcp-sentry/*.json` for commit.
 *
 * Prerequisites:
 *   1. mcp-sentry fixture at branch `test/coherence-v1-smoke`, commit
 *      `9097294` (the `gradeBelow -> isBelowThreshold` rename drift).
 *   2. `claude` CLI on PATH and authenticated (run `claude` once if
 *      this is your first time).
 *   3. ANTHROPIC_API_KEY may be set OR unset — the agent SDK uses
 *      whichever auth `claude` is configured with. For subscription
 *      users the total_cost_usd is reported as $0.
 *
 * Usage:
 *   node scripts/record-mcp-sentry-cassettes.mjs            # record only if missing
 *   node scripts/record-mcp-sentry-cassettes.mjs --force    # re-record even if files exist
 *
 * After successful recording, commit `tests/cassettes/mcp-sentry/*.json`
 * and add the e2e test that replays them.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CONSUMER = process.argv.find((a) => !a.startsWith('--') && a !== process.execPath && !a.endsWith('.mjs'))
  ?? 'E:/Projects and Learning/mcp-sentry';
const FORCE = process.argv.includes('--force');

const COH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COH_DIST = path.join(COH_ROOT, 'dist');
const distUrl = (rel) => pathToFileURL(path.join(COH_DIST, rel)).href;

// Pin cassette dir to the committed tests/cassettes path AND ask llmCall
// to record. With COHERENCE_REFRESH_CASSETTES=1, llmCall skips replay
// (even if a file already exists) and records the fresh result.
const CASSETTES_DIR = path.join(COH_ROOT, 'tests', 'cassettes');
process.env['COHERENCE_CASSETTES_DIR'] = CASSETTES_DIR;
process.env['COHERENCE_REFRESH_CASSETTES'] = '1';

console.log(`\n=== record-mcp-sentry-cassettes against ${CONSUMER} ===`);
console.log(`Cassette dir: ${CASSETTES_DIR}`);
console.log(`Force: ${FORCE}\n`);

const SECTION_GROUP = {
  triggering_files: ['packages/cli/src/grade.ts'],
  entries: [
    { sectionRef: '.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules',
      path: '.claude/skills/mcp-sentry-grader/SKILL.md' },
    { sectionRef: '.claude/agents/sentry-reviewer.md#grading-calls',
      path: '.claude/agents/sentry-reviewer.md' },
    { sectionRef: 'docs/agents-and-skills/reference.md#reviewer-agent',
      path: 'docs/agents-and-skills/reference.md' },
  ],
};

const STAGE1_CASSETTE_ID = 'mcp-sentry/stage1-grading';
const STAGE2_CASSETTE_IDS = new Map([
  ['.claude/skills/mcp-sentry-grader/SKILL.md#grading-rules', 'mcp-sentry/stage2-skill-grading-rules'],
  ['.claude/agents/sentry-reviewer.md#grading-calls',          'mcp-sentry/stage2-agent-grading-calls'],
  ['docs/agents-and-skills/reference.md#reviewer-agent',       'mcp-sentry/stage2-doc-reviewer-agent'],
]);

function cassetteFile(id) {
  return path.join(CASSETTES_DIR, id + '.json');
}

function anyCassetteExists() {
  const all = [STAGE1_CASSETTE_ID, ...STAGE2_CASSETTE_IDS.values()];
  return all.some((id) => existsSync(cassetteFile(id)));
}

if (anyCassetteExists() && !FORCE) {
  console.log('Cassettes already exist. Re-run with --force to overwrite. Bailing.');
  for (const id of [STAGE1_CASSETTE_ID, ...STAGE2_CASSETTE_IDS.values()]) {
    const f = cassetteFile(id);
    console.log(`  ${existsSync(f) ? 'exists' : 'missing'}: ${path.relative(COH_ROOT, f)}`);
  }
  process.exit(0);
}

const { scanAnchors } = await import(distUrl('detection/anchorScanner.js'));
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache', 'coverage', '.next']);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, acc);
    else if (st.isFile() && /\.(md|ts|tsx|js|jsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

const files = walk(CONSUMER);
const anchored = [];
for (const f of files) {
  const rel = path.relative(CONSUMER, f).replace(/\\/g, '/');
  let content; try { content = readFileSync(f, 'utf8'); } catch { continue; }
  if (!content.includes('coherence:section')) continue;
  const { sections } = scanAnchors(content, rel);
  if (sections.length > 0) anchored.push({ path: rel, sections });
}
const projectFileContents = [];
for (const f of files) {
  const rel = path.relative(CONSUMER, f).replace(/\\/g, '/');
  if (/\.(ts|tsx|js|jsx)$/.test(f) && !rel.startsWith('.claude/') && !rel.startsWith('docs/')) {
    try { projectFileContents.push(readFileSync(f, 'utf8')); } catch { /* */ }
  }
}
const sectionIndex = anchored.flatMap((a) => a.sections.map((s) => ({
  sectionRef: `${a.path}#${s.id}`, path: a.path, heading: s.id,
})));
console.log(`Discovered ${anchored.length} anchored files, ${projectFileContents.length} source files for the hallucination corpus.\n`);

// Set up the state store under the mcp-sentry repo so cost-ledger writes
// land there (out of our tree). Idempotent.
const { StateStore } = await import(distUrl('state/stateStore.js'));
const _cdir = path.join(CONSUMER, '.claude', 'coherence');
mkdirSync(_cdir, { recursive: true });
mkdirSync(path.join(_cdir, 'quarantine'), { recursive: true });
const ledgerStore = new StateStore(_cdir, path.join(_cdir, 'quarantine'));

const { runStage1 } = await import(distUrl('pipeline/stage1.js'));
const { runStage2 } = await import(distUrl('pipeline/stage2.js'));
const { CostLedger } = await import(distUrl('llm/costLedger.js'));

mkdirSync(path.dirname(cassetteFile(STAGE1_CASSETTE_ID)), { recursive: true });

// ---- Stage 1 -----------------------------------------------------------
console.log('--- Stage 1: planner (real LLM call) ---');
const t1 = Date.now();
const stage1Ledger = new CostLedger(ledgerStore, 'record-mcp-sentry-s1');
let plan;
try {
  plan = await runStage1(SECTION_GROUP, sectionIndex, stage1Ledger, STAGE1_CASSETTE_ID);
} catch (err) {
  console.error(`FAIL: runStage1 threw: ${err?.message ?? err}`);
  process.exit(1);
}
console.log(`Stage 1 returned in ${Date.now() - t1} ms`);
console.log(`Cost: $${stage1Ledger.totalCostUsd().toFixed(6)} (subscription users see $0)`);
if (!plan) {
  console.error('FAIL: Stage 1 returned null — planner response not parseable as a plan JSON.');
  console.error('       Recorded cassette is still on disk for inspection.');
  process.exit(1);
}
console.log('Plan:');
console.log(JSON.stringify(plan, null, 2));
console.log();

// ---- Stage 2 -----------------------------------------------------------
console.log('--- Stage 2: patch writer (real LLM call per section) ---');

function readSectionContent(rel, sectionId) {
  const content = readFileSync(path.join(CONSUMER, rel), 'utf8');
  const { sections } = scanAnchors(content, rel);
  return sections.find((s) => s.id === sectionId)?.content ?? '';
}
const layerFor = (p) => /SKILL\.md$/i.test(p) ? 'skill'
  : /CLAUDE\.md$/i.test(p) ? 'config'
  : /agent/i.test(p) ? 'subagent' : 'referring-doc';

const stage2Inputs = plan.sections.map((ps) => {
  const [rel, id] = ps.sectionRef.split('#');
  return {
    sectionRef: ps.sectionRef,
    role: ps.role,
    relation: ps.relation ?? null,
    heading: id,
    current_content: readSectionContent(rel, id),
    canonical_content: ps.role === 'canonical' ? null : readSectionContent(...plan.canonical.split('#')),
    changed_tokens: ['gradeBelow', 'isBelowThreshold'],
    layer: layerFor(rel),
  };
});

// Map each section's ref to a cassetteId so Stage 2 records per-section.
const idMap = new Map();
for (const s of plan.sections) {
  const declared = STAGE2_CASSETTE_IDS.get(s.sectionRef);
  if (declared) idMap.set(s.sectionRef, declared);
}

const t2 = Date.now();
const stage2Ledger = new CostLedger(ledgerStore, 'record-mcp-sentry-s2');
let results;
try {
  results = await runStage2(plan, stage2Inputs, stage2Ledger, CONSUMER, projectFileContents, idMap);
} catch (err) {
  console.error(`FAIL: runStage2 threw: ${err?.message ?? err}`);
  process.exit(1);
}
console.log(`Stage 2 returned in ${Date.now() - t2} ms across ${results.length} sections`);
console.log(`Cost: $${stage2Ledger.totalCostUsd().toFixed(6)}\n`);

for (const r of results) {
  console.log(`Section ${r.patch.sectionRef}:`);
  console.log(`  changeClass      = ${r.patch.changeClass}`);
  console.log(`  validationPassed = ${r.patch.validationPassed}`);
  if (typeof r.patch.diff === 'string' && r.patch.diff !== 'NO_PATCH_NEEDED' && r.patch.diff !== 'ESCALATE') {
    console.log(`  diff             = (${r.patch.diff.length} chars)`);
  } else {
    console.log(`  diff             = ${r.patch.diff}`);
  }
  console.log(`  validationLog    : ${r.validationLog.join(' | ')}\n`);
}

// ---- Verify cassettes ended up on disk ---------------------------------
console.log('--- Recorded cassettes ---');
let missing = 0;
for (const id of [STAGE1_CASSETTE_ID, ...STAGE2_CASSETTE_IDS.values()]) {
  const f = cassetteFile(id);
  const ok = existsSync(f);
  if (!ok) missing++;
  console.log(`  ${ok ? 'OK ' : 'MISS'}: ${path.relative(COH_ROOT, f)}`);
}
if (missing > 0) {
  console.error(`\n${missing} cassette(s) missing — recording incomplete.`);
  process.exit(1);
}
console.log('\nAll cassettes recorded. Inspect for sanity, then commit them under tests/cassettes/mcp-sentry/.');
