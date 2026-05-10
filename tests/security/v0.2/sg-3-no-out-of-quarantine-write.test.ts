/**
 * Static-scan boundary check (DD-065 SG-3).
 *
 * Walks `src/` looking for `fs.writeFile*`, `writeFileSync`, `appendFileSync`,
 * `createWriteStream`, `mkdirSync`, `renameSync` calls. Every match must be
 * either:
 *  - inside the allow-list (modules below), OR
 *  - written to a path under `.claude/coherence/`.
 *
 * The check is conservative: if the path argument can't be statically proven
 * to be a quarantine path, we still allow it iff the call site is in the
 * allow-list. The allow-list is the list of files where boundary-crossing
 * writes are *allowed*; everything else must be refactored to flow through
 * `writeProposalArtifact` or `stateStore.write`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'src');

/** Modules that ARE allowed to write outside `.claude/coherence/`. */
const ALLOW_LIST = new Set<string>([
  // The cross-the-boundary operator (M1 skeleton; full impl in M5/M7).
  'src/permissions/proposeAccept.ts',
  // M7 propose-* commands that materialise accepted proposals into the
  // project tree. Each goes through the token-gated loadProposalArtifact
  // and is the *only* code path that lands files outside .claude/coherence/.
  'src/commands/proposeAccept.ts',
  'src/commands/proposeRevertAcceptance.ts',
  // Statusline install/uninstall (M3) — only other boundary operator.
  'src/commands/installStatusline.ts',
  'src/commands/uninstallStatusline.ts',
  // v0.1 inherited writers under .claude/coherence/ — verified by stateStore
  // contract and tested separately.
  'src/state/stateStore.ts',
  'src/state/quarantine.ts',
  'src/state/init.ts',
  'src/state/sentinels.ts',
  'src/state/locks.ts',
  'src/state/metricsRetention.ts',
  'src/state/finalizeSweep.ts',
  'src/state/migrate/v0_to_v1.ts',
  'src/state/migrate/v1_to_v2.ts',
  // v0.2 writers that target only quarantine (.claude/coherence/proposals/).
  'src/proposals/quarantine.ts',
  'src/proposals/manifest.ts',
  // v0.1 commands with reviewed boundary semantics:
  //  - enableSidecars: sidecar manifest provisioning (DD-049).
  //  - shareMetrics: user-chosen anonymised export path (DD-086).
  //  - repair: rewrites coherence state files only.
  'src/commands/enableSidecars.ts',
  'src/commands/shareMetrics.ts',
  'src/commands/repair.ts',
  // LLM cassette is a test-mode replay store; never runs in prod hooks.
  'src/llm/cassette.ts',
  // Validation apply writes diffs to project files via the v0.1 atomic patch
  // contract; legitimate v0.1 surgical patch surface.
  'src/validation/apply.ts',
]);

const WRITE_RE = /\b(fs\.(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|mkdirSync|mkdir|renameSync|rename|unlinkSync|unlink)|writeFileSync|appendFileSync|createWriteStream|mkdirSync|renameSync)\b/;

function walkSrc(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkSrc(full, acc);
    else if (st.isFile() && full.endsWith('.ts') && !full.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

describe('SG-3 boundary: no fs.write outside the allow-list (DD-065)', () => {
  const offenders: string[] = [];
  const files = walkSrc(SRC);

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (ALLOW_LIST.has(rel)) continue;
    const text = readFileSync(file, 'utf8');
    if (!WRITE_RE.test(text)) continue;
    // Trim noise: `import` and JSDoc lines that mention the symbols.
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(\*|\/\/|\/\*|import )/.test(line)) continue;
      if (WRITE_RE.test(line)) {
        offenders.push(`${rel}:${i + 1}\t${line.trim()}`);
        break;
      }
    }
  }

  it('every fs.write call lives inside the SG-3 allow-list', () => {
    expect(
      offenders,
      `Boundary lint: the following files write the filesystem without being in the SG-3 allow-list:\n${offenders.join('\n')}\n\nAdd the file to the allow-list in tests/security/v0.2/sg-3-no-out-of-quarantine-write.test.ts only if the writer is verified to land under .claude/coherence/.`,
    ).toEqual([]);
  });
});
