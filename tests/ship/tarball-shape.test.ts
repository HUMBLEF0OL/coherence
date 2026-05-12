/**
 * v0.3 M6 — M-LEGACY-1 + M-INSTALL-1 ship-time gates (NFR-ARCH-2, DD-118).
 *
 * Asserts the shape of `npm pack --dry-run` output:
 *   1. No path under `prompts/v1/` (DD-118 — legacy artifacts excluded).
 *   2. No path under `src/state/migrate/v1_to_v2.ts` (DD-080 retired).
 *   3. Tarball size ≤ 10 MB (M-INSTALL-1).
 *   4. `dist/state/schemas/` is non-empty post-build (round-2 C5 follow-up:
 *      schemas are runtime-loaded by the Anthropic SDK / AJV path, so the
 *      build step has to copy them out of `src/state/schemas/` into `dist/`).
 *
 * Implementation note: `npm pack --dry-run` is slow (~3-5 s on Windows). We
 * shell out once and parse its stdout. The test is gated under the `ship`
 * vitest project so it only runs in the ship-time CI matrix.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function npmPackDryRun(): { stdout: string; stderr: string } {
  // `--json` makes parsing trivial. Older npm versions also emit the
  // file list as plain stdout; we tolerate both.
  //
  // Audit-fix E10: `shell: true` on every platform. On Linux/macOS, `npm`
  // is often a shell-script shim (nvm, n, volta) that `execFileSync`
  // without `shell: true` cannot launch — it ENOENTs in CI cells with
  // managed Node toolchains. Going through a shell on every platform is
  // safe here because the args are fixed literals, not user input.
  const stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  return { stdout, stderr: '' };
}

interface PackEntry {
  files?: Array<{ path: string; size?: number }>;
  size?: number;
  unpackedSize?: number;
}

describe('M-LEGACY-1 + M-INSTALL-1: tarball shape (NFR-ARCH-2, DD-118)', () => {
  let entries: Array<{ path: string; size: number }> = [];
  let totalSize = 0;
  let parsed = false;

  try {
    const { stdout } = npmPackDryRun();
    const blocks = JSON.parse(stdout) as PackEntry[];
    const block = Array.isArray(blocks) ? blocks[0] : blocks;
    entries = (block.files ?? []).map((f) => ({ path: f.path, size: f.size ?? 0 }));
    totalSize = block.size ?? 0;
    parsed = true;
  } catch {
    parsed = false;
  }

  it('npm pack --dry-run runs cleanly and emits a parseable JSON file list', () => {
    expect(parsed, '`npm pack --dry-run --json` failed; M6 cannot enforce M-LEGACY-1').toBe(true);
  });

  it('tarball excludes prompts/v1/ (DD-118)', () => {
    if (!parsed) return; // Above test will fail; skip here.
    const offenders = entries.filter((e) => e.path.includes('prompts/v1/'));
    expect(offenders.map((e) => e.path)).toEqual([]);
  });

  it('tarball excludes src/state/migrate/v1_to_v2.ts (DD-080 retired)', () => {
    if (!parsed) return;
    const offenders = entries.filter((e) => e.path.includes('v1_to_v2'));
    expect(offenders.map((e) => e.path)).toEqual([]);
  });

  it('tarball size ≤ 10 MB (M-INSTALL-1)', () => {
    if (!parsed) return;
    expect(totalSize).toBeLessThanOrEqual(10 * 1024 * 1024);
  });

  it('dist/state/schemas/ is non-empty post-build (round-2 C5)', () => {
    const schemasDir = path.join(ROOT, 'dist', 'state', 'schemas');
    expect(
      existsSync(schemasDir),
      `dist/state/schemas/ missing — run \`npm run build\` (which now triggers scripts/copy-schemas.mjs) before \`npm run gates\``,
    ).toBe(true);
    const files = readdirSync(schemasDir).filter(
      (n) => n.endsWith('.json') && statSync(path.join(schemasDir, n)).isFile(),
    );
    expect(files.length).toBeGreaterThan(0);
  });

  it('tarball includes .claude-plugin/plugin.json (v0.4 manifest location)', () => {
    if (!parsed) return;
    expect(
      entries.some((e) => e.path.includes('.claude-plugin/plugin.json')),
      'Expected .claude-plugin/plugin.json in tarball — run M0 manifest relocation first',
    ).toBe(true);
  });

  it('tarball excludes root-level plugin.json (old v0.3 location)', () => {
    if (!parsed) return;
    const rootManifest = entries.filter((e) => /^plugin\.json$/.test(e.path));
    expect(rootManifest.map((e) => e.path)).toEqual([]);
  });
});
