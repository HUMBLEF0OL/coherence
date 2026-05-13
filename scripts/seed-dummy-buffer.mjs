#!/usr/bin/env node
/**
 * One-off helper: seed the cohrence-dummy fixture's drift buffer with
 * entries that mirror what PostToolUse would have written had Claude Code
 * performed the multiply -> times rename through its Edit tool.
 *
 * After running this, open a Claude Code session inside
 * E:/Projects and Learning/cohrence-dummy/ and run /coherence:review —
 * coherence will pick up the seeded entries and run Stage 1 / Stage 2
 * against them.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT = 'E:/Projects and Learning/cohrence-dummy';
const COH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distUrl = (rel) => pathToFileURL(path.join(COH_ROOT, 'dist', rel)).href;

const { scanAnchors } = await import(distUrl('detection/anchorScanner.js'));
const { StateStore } = await import(distUrl('state/stateStore.js'));
const { BufferLifecycle } = await import(distUrl('buffer/lifecycle.js'));
const { hashContent } = await import(distUrl('buffer/contentHash.js'));
const { nowIsoUtc } = await import(distUrl('util/time.js'));
const { initCoherenceDir } = await import(distUrl('state/init.js'));

const SECTIONS = [
  { rel: '.claude/skills/calc-helper/SKILL.md',     id: 'basics' },
  { rel: '.claude/agents/calc-reviewer.md',         id: 'symbol-surface' },
  { rel: 'docs/api/calc.md',                        id: 'overview' },
  { rel: 'docs/api/calc.md',                        id: 'examples' },
];

// Init .claude/coherence/ skeleton (version.json, config.json, etc.)
await initCoherenceDir(PROJECT);

const cdir = path.join(PROJECT, '.claude', 'coherence');
mkdirSync(path.join(cdir, 'quarantine'), { recursive: true });
const store = new StateStore(cdir, path.join(cdir, 'quarantine'));
const lifecycle = new BufferLifecycle(store);

let seeded = 0;
for (const { rel, id } of SECTIONS) {
  const full = path.join(PROJECT, rel);
  const content = readFileSync(full, 'utf8');
  const { sections } = scanAnchors(content, rel);
  const section = sections.find((s) => s.id === id);
  if (!section) {
    console.warn(`[seed-buffer] section ${rel}#${id} not found — skipping`);
    continue;
  }
  await lifecycle.append({
    path: rel,
    sectionRef: `${rel}#${id}`,
    contentHash: hashContent(section.content),
    triggeredAt: nowIsoUtc(),
    source: 'posttooluse',
  });
  seeded++;
  console.log(`[seed-buffer] queued ${rel}#${id}`);
}

const buf = await lifecycle.read();
console.log(`\n[seed-buffer] buffer state = ${buf.state}, entries = ${buf.entries.length}`);
console.log(`[seed-buffer] file: ${path.join(cdir, 'drift-buffer.json')}`);

const COH_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.log(`\nNext step — open the dummy with cohrence loaded as a local plugin:`);
console.log(`\n  cd "${PROJECT}"`);
console.log(`  claude --plugin-dir "${COH_REPO}"`);
console.log(`\nThen run /coherence:review inside that session. With the 4 seeded`);
console.log(`entries the pipeline will exercise Stage 1 + Stage 2 against the rename`);
console.log(`drift. Expected outcome (per tests/e2e/E2E-11):`);
console.log(`  - SKILL.md#basics  → ESCALATE (Fix 8 / symbol_exported blocks the patch)`);
console.log(`  - 3 other sections → modifying patches, all DEFER at trust score 0.000`);
console.log(`\nTo reset the dummy back to pristine state:`);
console.log(`  node scripts/setup-dummy-project.mjs --with-drift && node scripts/seed-dummy-buffer.mjs`);
