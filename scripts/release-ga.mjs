#!/usr/bin/env node
/**
 * v0.4.0 GA release script.
 *
 * Preflight gates (M0..M5 acceptance):
 *   1. typecheck (`tsc --noEmit`)
 *   2. lint (`eslint src tests`)
 *   3. build (`npm run build`) — incl. stub generation
 *   4. assertVersionSync(TAG) — M-SEMVER-1
 *   5. claude plugin validate — M-VALIDATE-1
 *   6. ship-time gates (`npm run gates`)
 *   7. corpus calibration (`npm run calibrate`) — M-CALIB-1 floor
 *   8. full vitest run
 *   9. tarball preflight (`npm run pack:size`)
 *
 * Pass `--tag` to actually create the GA tag, `--push` to push to origin.
 * Pass `--dry-run` to run all gates without cutting a tag.
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync, mkdirSync, renameSync, existsSync, createHash } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { scanEmbeddedVersions, EMBEDDED_VERSION_ALLOWLIST } from './lib/version-scanner.mjs';

const args = new Set(process.argv.slice(2));
const doTag = args.has('--tag');
const doPush = args.has('--push');
const dryRun = args.has('--dry-run');
const unsigned = args.has('--unsigned');
const TAG = 'v1.0.2';
const MSG = 'v1.0.2 — plugin manifest schema migration + marketplace.json';

void createHash;

function run(cmd) {
  console.log(`\n[release-ga] $ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (err) {
    console.error(`[release-ga] FAIL: ${cmd}`);
    process.exit(1);
  }
}

function assertVersionSync(tag) {
  const v = tag.replace(/^v/, '');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const manifest = JSON.parse(readFileSync('.claude-plugin/plugin.json', 'utf8'));
  const marketplace = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'));
  const initSrc = readFileSync('src/state/init.ts', 'utf8');
  const m = /PLUGIN_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(initSrc);
  const initVer = m?.[1];
  const mkVer = marketplace.plugins?.[0]?.version;
  const mkRef = marketplace.plugins?.[0]?.source?.ref;

  const mismatches = [];
  if (pkg.version !== v) mismatches.push(`package.json=${pkg.version}`);
  if (manifest.version !== v) mismatches.push(`.claude-plugin/plugin.json=${manifest.version}`);
  if (initVer !== v) mismatches.push(`PLUGIN_VERSION=${initVer ?? '(not found)'}`);
  if (mkVer !== v) mismatches.push(`marketplace.plugins[0].version=${mkVer ?? '(not found)'}`);
  if (mkRef !== tag) mismatches.push(`marketplace.plugins[0].source.ref=${mkRef ?? '(not found)'}`);

  if (mismatches.length > 0) {
    throw new Error(`Version mismatch for tag ${tag}: ${mismatches.join(', ')}`);
  }

  // v1.0.1 M1: scan src/**/*.ts for embedded version literals that drift
  // from the canonical version (closes the bug class behind Fix 2).
  const embeddedFindings = scanEmbeddedVersions('src', v).filter(
    (f) => !EMBEDDED_VERSION_ALLOWLIST.has(`${f.file}:${f.line}`),
  );
  if (embeddedFindings.length > 0) {
    const detail = embeddedFindings
      .map((f) => `  ${f.file}:${f.line}  value='${f.value}'  context:\n    ${f.snippet}`)
      .join('\n');
    throw new Error(
      `Embedded version constants drift from canonical ${v}:\n${detail}\n\n` +
      `Each occurrence is a SemVer string in a line that also names \`*version*\`.\n` +
      `If the literal is intentional (e.g. migration helper for a prior major), add\n` +
      `\`<file>:<line>\` to EMBEDDED_VERSION_ALLOWLIST in scripts/release-ga.mjs.`,
    );
  }
  console.log(`[release-ga] version sync OK — all sources + embedded constants = ${v}`);
}

function runValidatePlugin() {
  const result = spawnSync('npm', ['run', 'validate-plugin'], { stdio: 'pipe', shell: true });
  const out = (result.stdout?.toString() ?? '') + (result.stderr?.toString() ?? '');

  if (out.toLowerCase().includes('warning')) {
    appendFileSync('ci-validate-warnings.txt', `=== validate run ===\n${out}\n`);
    console.log('[release-ga] warnings logged to ci-validate-warnings.txt');
  }

  if (result.status !== 0) {
    throw new Error(`claude plugin validate FAILED (exit ${result.status}):\n${out}`);
  }
  console.log('[release-ga] claude plugin validate passed');
}

console.log(`[release-ga] running ${TAG} GA acceptance checklist…`);
run('npx tsc --noEmit');
run('npm run lint');
run('npm run build');

try {
  assertVersionSync(TAG);
} catch (err) {
  console.error(`[release-ga] FAIL: ${err.message}`);
  process.exit(1);
}

try {
  runValidatePlugin();
} catch (err) {
  console.error(`[release-ga] FAIL: ${err.message}`);
  process.exit(1);
}

run('npm run gates');
run('npm run calibrate');
run('npx vitest run');
run('npm run pack:size');

/**
 * v1.0 M4 — cosign sign step (TS-7, FR-SIGN-*).
 *
 * In GitHub Actions (CI) we sign the packed tarball via cosign keyless OIDC.
 * Locally we either bail out (signing requires GitHub Actions) or, with
 * `--unsigned`, rename the tgz to `<name>-UNSIGNED.tgz` so it cannot be
 * confused with a signed artifact.
 */
function runSignStep() {
  const isCI = process.env.GITHUB_ACTIONS === 'true';
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const tgz = `${pkg.name}-${pkg.version}.tgz`;
  if (!isCI && !unsigned) {
    console.error(`[release-ga] cosign signing requires GitHub Actions. Pass --unsigned to bypass (produces ${pkg.name}-${pkg.version}-UNSIGNED.tgz).`);
    process.exit(1);
  }
  // Generate sha256 alongside (always, regardless of signing path)
  const artifactsDir = path.join('release-artifacts');
  mkdirSync(artifactsDir, { recursive: true });
  const shaFile = path.join(artifactsDir, `${pkg.name}-${pkg.version}.sha256`);
  if (existsSync(tgz)) {
    const buf = readFileSync(tgz);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    appendFileSync(shaFile, `${sha}  ${tgz}\n`);
    console.log(`[release-ga] wrote sha256 to ${shaFile}`);
  } else {
    console.warn(`[release-ga] tarball ${tgz} not found in cwd; skipping sha256 (npm pack runs separately in CI).`);
  }
  if (!isCI && unsigned) {
    if (existsSync(tgz)) {
      const unsignedTgz = `${pkg.name}-${pkg.version}-UNSIGNED.tgz`;
      renameSync(tgz, unsignedTgz);
      console.error(`[release-ga] WARNING: Unsigned release artifact — do not distribute publicly: ${unsignedTgz}`);
    }
    return;
  }
  // CI path: cosign sign-blob with keyless OIDC
  run(`cosign sign-blob --yes ${tgz} --output-signature ${tgz}.sig --output-certificate ${tgz}.pem`);
  console.log('[release-ga] cosign sign-blob completed.');
}

runSignStep();

if (dryRun) {
  console.log('\n[release-ga] --dry-run: all gates green; no tag created.');
  process.exit(0);
}

if (doTag) {
  console.log('\n[release-ga] all gates green — cutting GA tag.');
  run(`git tag -s ${TAG} -m "${MSG}"`);
  if (doPush) {
    run(`git push origin ${TAG}`);
  } else {
    console.log(`\n[release-ga] tag created locally. To publish: git push origin ${TAG}`);
  }
} else {
  console.log('\n[release-ga] all gates green. To cut the GA tag, re-run with --tag (and optionally --push):');
  console.log(`  node scripts/release-ga.mjs --tag --push`);
  console.log('Manual equivalents:');
  console.log(`  git tag -s ${TAG} -m "${MSG}"`);
  console.log(`  git push origin ${TAG}`);
}
