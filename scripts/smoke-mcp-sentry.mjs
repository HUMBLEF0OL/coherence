#!/usr/bin/env node
/**
 * Smoke harness — exercise coherence's pipeline against the mcp-sentry test
 * branch (`test/coherence-v1-smoke`). NOT shipped — local test fixture only.
 *
 * What it does:
 *   1. Walks the project for files containing `<!-- coherence:section -->`
 *      anchors and feeds them through `anchorScanner` to build a section
 *      index (the same module SessionStart uses).
 *   2. Reads grade.ts (where the drift lives) and runs the v1.0
 *      hallucination check against each anchored section's content. The
 *      check looks for symbol references in section bodies that no longer
 *      exist in the source — exactly what should happen after the
 *      `gradeBelow` → `isBelowThreshold` rename.
 *   3. Reports what coherence's pipeline catches end-to-end.
 *
 * Pure-deterministic — no LLM calls, no network. The Stage 1 + Stage 2
 * stages need ANTHROPIC_API_KEY and a Claude Code session to fire
 * (PostToolUse triggers); since we're not in a session, we exercise the
 * detection + validation layers directly.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CONSUMER = process.argv[2] ?? 'E:/Projects and Learning/mcp-sentry';
const COH_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const distUrl = (rel) => pathToFileURL(path.join(COH_DIST, rel)).href;

// Import the actual coherence modules (built artifacts).
const { scanAnchors } = await import(distUrl('detection/anchorScanner.js'));
const { checkHallucination } = await import(distUrl('validation/hallucination.js'));

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache', 'coverage', '.next', '.astro', '.wrangler']);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, acc);
    else if (st.isFile() && /\.(md|ts|tsx|js|jsx|py|go|rs)$/.test(name)) acc.push(full);
  }
  return acc;
}

console.log(`\n=== coherence smoke against ${CONSUMER} ===\n`);

// --- Phase 1: anchor scan ----------------------------------------------------
console.log('--- phase 1: anchor scan ---');
const files = walk(CONSUMER);
const anchored = [];
const allWarnings = [];
for (const f of files) {
  const rel = path.relative(CONSUMER, f).replace(/\\/g, '/');
  let content;
  try { content = readFileSync(f, 'utf8'); } catch { continue; }
  if (!content.includes('coherence:section')) continue;
  const { sections, warnings } = scanAnchors(content, rel);
  if (sections.length === 0) continue;
  anchored.push({ path: rel, sections });
  for (const w of warnings) allWarnings.push(`${rel}: ${w}`);
}
console.log(`Found ${anchored.length} anchored file(s):`);
for (const a of anchored) {
  console.log(`  ${a.path}`);
  for (const s of a.sections) {
    console.log(`    - #${s.id}  (lines ${s.lineStart}..${s.lineEnd}, ${s.content.length} chars)`);
  }
}
if (allWarnings.length > 0) {
  console.log('Warnings:');
  for (const w of allWarnings) console.log('  ' + w);
}

// --- Phase 2: collect project source content for hallucination check --------
console.log('\n--- phase 2: hallucination grep against drifted source ---');
const projectFiles = [];
for (const f of files) {
  const rel = path.relative(CONSUMER, f).replace(/\\/g, '/');
  if (/\.(ts|tsx|js|jsx)$/.test(f) && !rel.startsWith('.claude/') && !rel.startsWith('docs/')) {
    try { projectFiles.push(readFileSync(f, 'utf8')); } catch { /* skip */ }
  }
}
console.log(`Loaded ${projectFiles.length} source files for the grep corpus.`);

// --- Phase 3: per-section hallucination simulation --------------------------
// Coherence runs hallucination check against PATCHES, not sections. To
// simulate "what coherence would flag after the gradeBelow rename", we
// synthesise a unified diff for each section that ADDS lines referencing
// gradeBelow — since gradeBelow no longer exists in projectFiles, the
// check should flag it as a strict-tier unknown token.
console.log('');
const drifted = 'gradeBelow';
for (const { path: docPath, sections } of anchored) {
  for (const s of sections) {
    if (!s.content.includes(drifted)) continue;
    // Build a minimal unified diff that "adds" the section content as new lines
    const lines = s.content.split('\n').slice(0, 30); // cap fixture size
    const diff = [
      `--- a/${docPath}`,
      `+++ b/${docPath}`,
      `@@ -1,0 +1,${lines.length} @@`,
      ...lines.map((l) => '+' + l),
    ].join('\n');
    const result = checkHallucination(diff, [s.content], projectFiles);
    console.log(`Section ${docPath}#${s.id}:`);
    console.log(`  hallucination.passed     = ${result.passed}`);
    console.log(`  demoteClass              = ${result.demoteClass}`);
    console.log(`  unknownStrictTokens      = ${JSON.stringify(result.unknownStrictTokens)}`);
    console.log(`  unknownLooseOnlyTokens   = ${JSON.stringify(result.unknownLooseOnlyTokens)}`);
    if (!result.passed) {
      console.log(`  → coherence would BLOCK this patch (escalate to ESCALATE)`);
    } else if (result.demoteClass) {
      console.log(`  → coherence would DEMOTE this patch's changeClass`);
    } else {
      console.log(`  → patch would pass hallucination check`);
    }
  }
}

// --- Phase 4: simulate the asserts: pipeline -------------------------------
console.log('\n--- phase 4: asserts pipeline (v1.0 M2) ---');
const { runAssertionsForSection, parseAsserts } = await import(distUrl('validation/assertions/index.js'));
let assertCount = 0;
for (const { path: docPath, sections } of anchored) {
  for (const s of sections) {
    // No file-level asserts: in mcp-sentry, but exercise the engine anyway
    // by passing a synthetic ruleset that mirrors what a docs maintainer
    // might add to enforce code-symbol presence.
    const synthetic = parseAsserts([
      { type: 'has_example', policy: 'warn' },
      { type: 'symbol_exists', param: 'gradeBelow:typescript', policy: 'block' },
    ]);
    const results = await runAssertionsForSection(`${docPath}#${s.id}`, s.content, synthetic, {
      projectRoot: CONSUMER,
      emitWarning: (m) => console.log('  WARN:', m),
    });
    const block = results.filter((r) => !r.ignored && !r.passed && r.policy === 'block');
    const warn = results.filter((r) => !r.ignored && !r.passed && r.policy === 'warn');
    if (block.length > 0 || warn.length > 0) {
      assertCount += block.length + warn.length;
      console.log(`Section ${docPath}#${s.id}:`);
      for (const b of block) console.log(`  BLOCK ${b.type}: ${b.message}`);
      for (const w of warn) console.log(`  warn  ${w.type}: ${w.message}`);
    }
  }
}
console.log(`Total assertion violations across all anchored sections: ${assertCount}`);

// --- Phase 5: token-budget classifier --------------------------------------
console.log('\n--- phase 5: token-budget classifier (v1.0 M3 free tier) ---');
const { classifyTokens, tierLabel } = await import(distUrl('audit/tokenBudget.js'));
for (const { path: docPath, sections } of anchored) {
  for (const s of sections) {
    const tokens = Math.ceil(s.content.length / 4);
    const tier = classifyTokens(tokens);
    console.log(`  ${docPath}#${s.id}: ${tokens} tokens → ${tierLabel(tier)}`);
  }
}

console.log('\n=== smoke complete ===\n');
