#!/usr/bin/env node
/**
 * v0.3 M7 — generate the synthetic signal corpus to ~30 cases per detector.
 *
 * One-shot helper, idempotent: only writes files that don't already exist
 * (skips existing fixtures). Designed for a single run to populate the
 * corpus; the resulting JSON files are the checked-in artifacts. Re-run
 * after manual additions to skip them.
 *
 * Usage: `node scripts/generate-corpus-fixtures.mjs`
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpus = path.join(root, 'tests', 'fixtures', 'signal-corpora');

function emit(rel, body) {
  const full = path.join(corpus, rel);
  if (existsSync(full)) {
    console.log(`  skip (exists): ${rel}`);
    return;
  }
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(body, null, 2) + '\n', 'utf8');
  console.log(`  wrote: ${rel}`);
}

// ──────────────────────────────────────────────────────────────────────────
// bash_repetition (target ~30 cases)
// ──────────────────────────────────────────────────────────────────────────

const bashAt = (mins) => {
  const totalSec = mins * 60;
  const h = 10 + Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `2026-05-10T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000Z`;
};

// Positives: many flavours of "same command repeated 3+ times within window".
const bashPositives = [
  ['repeated-jest.json', 'jest --watch', 0, 8, 16],
  ['repeated-pytest.json', 'pytest -k auth', 0, 5, 10],
  ['repeated-cargo-test.json', 'cargo test', 0, 4, 8],
  ['repeated-make.json', 'make', 0, 3, 6],
  ['repeated-npm-build.json', 'npm run build', 0, 7, 14],
  ['repeated-git-status.json', 'git status', 0, 1, 2],
  ['repeated-git-log.json', 'git log --oneline', 0, 6, 12],
  ['repeated-grep-todo.json', "grep -r 'FIXME' src/", 0, 9, 18],
  ['repeated-tsc-noemit.json', 'tsc --noEmit', 0, 10, 20],
  ['repeated-curl-localhost.json', 'curl http://localhost:3000/health', 0, 4, 8],
  ['burst-of-five.json', 'go build ./...', 0, 2, 4, 6, 8],
  ['burst-of-four.json', 'gofmt -l .', 0, 3, 6, 9],
];
for (const [filename, cmd, ...mins] of bashPositives) {
  emit(`bash/positive/${filename}`, {
    kind: 'bash_repetition',
    description: `Three or more identical "${cmd}" within window — must fire.`,
    expected_fired: true,
    samples: mins.map((m) => ({ command: cmd, at: bashAt(m) })),
  });
}

// Negatives: distinct commands, two-only repeats, repeats outside the window.
const bashNegatives = [
  ['three-distinct.json', false, [
    ['ls', 0],
    ['cd src', 1],
    ['vim foo.ts', 2],
  ]],
  ['identical-twice-only.json', false, [
    ['npm test', 0],
    ['npm test', 5],
  ]],
  ['identical-thrice-but-spread-45min.json', false, [
    ['rg pattern', 0],
    ['rg pattern', 22],
    ['rg pattern', 45],
  ]],
  ['identical-thrice-but-spread-60min.json', false, [
    ['cargo build', 0],
    ['cargo build', 30],
    ['cargo build', 60],
  ]],
  ['similar-but-different-args.json', false, [
    ['git diff foo.ts', 0],
    ['git diff bar.ts', 5],
    ['git diff baz.ts', 10],
  ]],
  ['interspersed-with-noise.json', false, [
    ['ls', 0],
    ['npm install', 5],
    ['cd src', 10],
    ['ls', 15],
  ]],
];
for (const [filename, fired, samples] of bashNegatives) {
  emit(`bash/negative/${filename}`, {
    kind: 'bash_repetition',
    description: 'Negative case — must NOT fire.',
    expected_fired: fired,
    samples: samples.map(([cmd, m]) => ({ command: cmd, at: bashAt(m) })),
  });
}

// Boundary: edge timestamps and normaliser corners.
const bashBoundaries = [
  ['third-on-window-edge-30-00.json', true, [
    ['node scripts/foo.mjs', 0],
    ['node scripts/foo.mjs', 15],
    ['node scripts/foo.mjs', 30],
  ]],
  ['quoting-variation.json', false, [
    ["echo 'hello'", 0],
    ['echo "hello"', 5],
    ["echo 'hello'", 10],
  ]],
  ['extra-whitespace.json', true, [
    ['ls    -la', 0],
    ['ls -la', 10],
    ['ls  -la', 20],
  ]],
];
for (const [filename, fired, samples] of bashBoundaries) {
  emit(`bash/boundary/${filename}`, {
    kind: 'bash_repetition',
    description: 'Boundary case for normaliser + window edges.',
    expected_fired: fired,
    samples: samples.map(([cmd, m]) => ({ command: cmd, at: bashAt(m) })),
  });
}

// Adversarial: timestamps in commands, log paths, PIDs.
const bashAdversarial = [
  ['embedded-timestamp.json', true, [
    ['log /tmp/run-2026-05-10T10:00:00.log', 0],
    ['log /tmp/run-2026-05-10T10:05:00.log', 5],
    ['log /tmp/run-2026-05-10T10:10:00.log', 10],
  ]],
  ['embedded-pid.json', true, [
    ['kill 12345', 0],
    ['kill 67890', 5],
    ['kill 11111', 10],
  ]],
  ['piped-chain-only-stage-repeats.json', false, [
    ['cat foo.json | jq .', 0],
    ['cat bar.json | jq .', 5],
    ['cat baz.json | jq .', 10],
  ]],
  ['arg-order-different.json', false, [
    ['npm install --save react', 0],
    ['npm install react --save', 5],
    ['npm install --save-dev react', 10],
  ]],
];
for (const [filename, fired, samples] of bashAdversarial) {
  emit(`bash/adversarial/${filename}`, {
    kind: 'bash_repetition',
    description: 'Adversarial: tests normaliser robustness.',
    expected_fired: fired,
    samples: samples.map(([cmd, m]) => ({ command: cmd, at: bashAt(m) })),
  });
}

// ──────────────────────────────────────────────────────────────────────────
// agent_correction (target ~30 cases)
// ──────────────────────────────────────────────────────────────────────────

const corrAt = (offsetSeconds) => {
  const base = new Date('2026-05-09T10:00:00Z').getTime();
  return new Date(base + offsetSeconds * 1000).toISOString();
};

// Positives: bursts of 3+ within 5 min, ratio above floor.
const correctionPositives = [
  ['burst-of-three.json', 'agent-A', [[0, 5, 10], [60, 5, 10], [180, 5, 10]]],
  ['burst-of-four.json', 'agent-B', [[0, 5, 10], [60, 5, 10], [120, 5, 10], [240, 5, 10]]],
  ['burst-of-five-tight.json', 'agent-C', [[0, 5, 10], [30, 5, 10], [60, 5, 10], [90, 5, 10], [120, 5, 10]]],
  ['burst-with-high-ratio.json', 'agent-D', [[0, 9, 10], [60, 9, 10], [180, 9, 10]]],
  ['burst-with-floor-ratio.json', 'agent-E', [[0, 2, 10], [60, 2, 10], [180, 2, 10]]],
  ['cross-day-bursts.json', 'agent-F', [[0, 5, 10], [86460, 5, 10], [86520, 5, 10], [86580, 5, 10]]],
  ['triple-with-mixed-ratio.json', 'agent-G', [[0, 5, 10], [60, 7, 10], [120, 6, 10]]],
];
for (const [filename, agent, triples] of correctionPositives) {
  emit(`correction/positive/${filename}`, {
    kind: 'agent_correction',
    description: 'Positive — must fire.',
    expected_fired: true,
    agent_id: agent,
    now: '2026-05-10T10:00:00Z',
    samples: triples.map(([s, lc, tl]) => ({
      agent_id: agent,
      at: corrAt(s),
      lines_changed: lc,
      total_lines: tl,
    })),
  });
}

// Negatives.
const correctionNegatives = [
  ['only-two-corrections.json', 'agent-Q', [[0, 5, 10], [60, 5, 10]]],
  ['three-spread-over-week.json', 'agent-R', [[0, 5, 10], [86400 * 2, 5, 10], [86400 * 5, 5, 10]]],
  ['ratio-below-floor.json', 'agent-S', [[0, 1, 10], [60, 1, 10], [180, 1, 10]]],
  ['ratio-zero.json', 'agent-T', [[0, 0, 10], [60, 0, 10], [180, 0, 10]]],
  ['burst-but-large-totals-low-ratio.json', 'agent-U', [[0, 5, 1000], [60, 5, 1000], [180, 5, 1000]]],
  ['only-one-correction-recent.json', 'agent-V', [[0, 5, 10]]],
];
for (const [filename, agent, triples] of correctionNegatives) {
  emit(`correction/negative/${filename}`, {
    kind: 'agent_correction',
    description: 'Negative — must NOT fire.',
    expected_fired: false,
    agent_id: agent,
    now: '2026-05-10T10:00:00Z',
    samples: triples.map(([s, lc, tl]) => ({
      agent_id: agent,
      at: corrAt(s),
      lines_changed: lc,
      total_lines: tl,
    })),
  });
}

// Boundary.
const correctionBoundaries = [
  ['ratio-at-floor-0_2.json', 'agent-W', [[0, 2, 10], [60, 2, 10], [180, 2, 10]]],
  ['burst-at-4m59.json', 'agent-X', [[0, 5, 10], [60, 5, 10], [299, 5, 10]]],
  ['three-but-only-two-in-burst.json', 'agent-Y', [[0, 5, 10], [60, 5, 10], [400, 5, 10]]],
];
for (const [filename, agent, triples] of correctionBoundaries) {
  // Heuristic: cases that put the third strictly outside burst window must NOT fire.
  const lastOffset = triples[triples.length - 1][0];
  const fired = lastOffset <= 300;
  emit(`correction/boundary/${filename}`, {
    kind: 'agent_correction',
    description: `Boundary — fired=${fired}.`,
    expected_fired: fired,
    agent_id: agent,
    now: '2026-05-10T10:00:00Z',
    samples: triples.map(([s, lc, tl]) => ({
      agent_id: agent,
      at: corrAt(s),
      lines_changed: lc,
      total_lines: tl,
    })),
  });
}

// Adversarial: same agent_id appearing twice with same timestamp; cross-agent bleed
// already exists; large lines_changed but very large total_lines (low ratio).
const correctionAdversarial = [
  // duplicate timestamps collapse to fewer distinct events → must NOT fire.
  ['duplicate-timestamps.json', 'agent-Z', [[0, 5, 10], [0, 5, 10], [60, 5, 10]], false],
  ['mixed-other-agents-bleed.json', 'agent-AA', [[0, 5, 10], [60, 5, 10], [180, 5, 10]], true],
  ['huge-totals-tiny-ratio.json', 'agent-BB', [[0, 9, 10000], [60, 9, 10000], [180, 9, 10000]], false],
];
for (const [filename, agent, triples, fired] of correctionAdversarial) {
  emit(`correction/adversarial/${filename}`, {
    kind: 'agent_correction',
    description: 'Adversarial — robustness check.',
    expected_fired: fired,
    agent_id: agent,
    now: '2026-05-10T10:00:00Z',
    samples: triples.map(([s, lc, tl]) => ({
      agent_id: agent,
      at: corrAt(s),
      lines_changed: lc,
      total_lines: tl,
    })),
  });
}

// ──────────────────────────────────────────────────────────────────────────
// file_creation (target ~30 cases — corpus starts empty)
// ──────────────────────────────────────────────────────────────────────────

// Helpers for content templates. First 5 NON-EMPTY lines determine the
// structural Jaccard, so positive fixtures keep those lines identical and
// vary only the body below.
function similarMd(_name, idx) {
  return [
    '# Skill',
    '## Synopsis',
    '## Behaviour',
    '## Errors',
    '## Notes',
    '',
    `Body uniqueness ${idx}.`,
  ].join('\n');
}
function distinctMd(name) {
  return `# ${name}\n\nUnrelated content for ${name}: ${Math.random().toString(36)}.\n`;
}
function sharedImportsTs() {
  return `import path from 'path';\nimport { readFileSync } from 'fs';\nimport { z } from 'zod';\nimport { unique } from './lib';\nimport { writeFileSync } from 'fs';\n\nexport function run() {\n  return path.join('a');\n}\n`;
}

const fcAt = (offsetMin) => {
  const base = new Date('2026-05-10T10:00:00Z').getTime();
  return new Date(base + offsetMin * 60_000).toISOString();
};

// Positive: 3 same-dir similar files (Jaccard ≥ 0.8).
const fcPositives = [
  ['three-similar-md-skills.json', [
    'docs/skills/foo.md',
    'docs/skills/bar.md',
    'docs/skills/baz.md',
  ], (p, i) => similarMd(path.basename(p, '.md'), i)],
  ['three-similar-config.json', [
    'configs/x/options.yaml',
    'configs/x/options-prod.yaml',
    'configs/x/options-dev.yaml',
  ], (_p, i) => `name: shared\nversion: 1\nshared: yes\nstable: true\nidx_marker: marker\n# distinct: ${i}\n`],
  ['three-shared-imports-ts.json', [
    'src/handlers/a.ts',
    'src/handlers/b.ts',
    'src/handlers/c.ts',
  ], () => sharedImportsTs()],
  ['three-similar-skill-md.json', [
    'docs/v0.3/cmd/foo.md',
    'docs/v0.3/cmd/bar.md',
    'docs/v0.3/cmd/baz.md',
  ], (_p, i) => `# Command\n## Synopsis\n## Behaviour\n## Errors\n## Examples\n\nbody-${i}\n`],
  ['four-files-same-dir.json', [
    'src/cmd/a.ts',
    'src/cmd/b.ts',
    'src/cmd/c.ts',
    'src/cmd/d.ts',
  ], () => sharedImportsTs()],
];
for (const [filename, paths, gen] of fcPositives) {
  emit(`file_creation/positive/${filename}`, {
    kind: 'file_creation',
    description: 'Same-dir structurally similar files — must fire.',
    expected_fired: true,
    samples: paths.map((p, i) => ({ filePath: p, content: gen(p, i), at: fcAt(i) })),
  });
}

// Negative.
const fcNegatives = [
  ['different-dirs.json', [
    'src/a/x.ts',
    'src/b/x.ts',
    'src/c/x.ts',
  ], () => sharedImportsTs(), false],
  ['structurally-distinct.json', [
    'src/util/a.ts',
    'src/util/b.ts',
    'src/util/c.ts',
  ], (p) => distinctMd(path.basename(p, '.ts')), false],
  ['only-two-files.json', [
    'src/util/x.ts',
    'src/util/y.ts',
  ], () => sharedImportsTs(), false],
  // node_modules + same-dir similar files: the detector alone fires (it
  // doesn't know about SKIP_DIRS). The protective gate is pathFilter. We
  // honour the detector's truth here so the corpus matches actual behaviour.
  ['similar-in-node-modules.json', [
    'node_modules/a/index.ts',
    'node_modules/a/util.ts',
    'node_modules/a/extra.ts',
  ], () => sharedImportsTs(), true],
];
for (const [filename, paths, gen, fired] of fcNegatives) {
  emit(`file_creation/negative/${filename}`, {
    kind: 'file_creation',
    description: 'Negative — must NOT fire.',
    expected_fired: fired,
    samples: paths.map((p, i) => ({ filePath: p, content: gen(p, i), at: fcAt(i) })),
  });
}

// Boundary.
const fcBoundaries = [
  ['exactly-three-files.json', [
    'src/api/a.ts',
    'src/api/b.ts',
    'src/api/c.ts',
  ], () => sharedImportsTs(), true],
  ['just-similar-enough.json', [
    'src/api/a.ts',
    'src/api/b.ts',
    'src/api/c.ts',
  ], () => `import path from 'path';\nimport { z } from 'zod';\nimport { unique } from './lib';\nimport { readFileSync } from 'fs';\nexport const x = 1;\n`, true],
  ['mixed-language-same-dir.json', [
    'src/util/a.ts',
    'src/util/b.py',
    'src/util/c.go',
  ], (p) => `// stub for ${p}\n`, false],
];
for (const [filename, paths, gen, fired] of fcBoundaries) {
  emit(`file_creation/boundary/${filename}`, {
    kind: 'file_creation',
    description: 'Boundary case.',
    expected_fired: fired,
    samples: paths.map((p, i) => ({ filePath: p, content: gen(p, i), at: fcAt(i) })),
  });
}

// Adversarial.
const fcAdversarial = [
  ['comment-heavy-files.json', [
    'src/lib/a.ts',
    'src/lib/b.ts',
    'src/lib/c.ts',
  ], () => `// auto-generated\n// do not edit\n// see scripts/gen.mjs\n// fixture\n// here\n\nexport const x = 1;\n`, true],
  ['large-files-only-first-5-lines-shared.json', [
    'src/handlers/h1.ts',
    'src/handlers/h2.ts',
    'src/handlers/h3.ts',
  ], (p, i) => `import path from 'path';\nimport { z } from 'zod';\nimport { unique } from './lib';\nimport { readFileSync } from 'fs';\nimport { writeFileSync } from 'fs';\n${'export const ' + path.basename(p, '.ts') + ' = ' + i + ';\n'}\n${'x\n'.repeat(200)}`, true],
  // The detector itself sees structural similarity regardless of path
  // segments; pathFilter is what excludes ignored paths, and it sits
  // upstream. The adversarial case demonstrates that the detector ALONE
  // cannot suppress firing — pathFilter is the gate. expected_fired=true.
  ['similar-but-in-ignored-path.json', [
    'dist/a.ts',
    'dist/b.ts',
    'dist/c.ts',
  ], () => sharedImportsTs(), true],
];
for (const [filename, paths, gen, fired] of fcAdversarial) {
  emit(`file_creation/adversarial/${filename}`, {
    kind: 'file_creation',
    description: 'Adversarial — tests boundary robustness.',
    expected_fired: fired,
    samples: paths.map((p, i) => ({ filePath: p, content: gen(p, i), at: fcAt(i) })),
  });
}

console.log('\n[generate-corpus-fixtures] done.');
