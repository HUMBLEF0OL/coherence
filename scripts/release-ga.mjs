#!/usr/bin/env node
/**
 * v0.3.0 GA release script.
 *
 * Preflight gates (M0..M8 acceptance):
 *   1. typecheck (`tsc --noEmit`)
 *   2. lint (`eslint src tests`)
 *   3. ship-time gates (`npm run gates` = static-analysis + ship)
 *   4. corpus calibration (`npm run calibrate`) — M-CALIB-1 floor
 *   5. full vitest run
 *   6. tarball preflight (`npm pack --dry-run` already wrapped by `npm run pack:size`)
 *
 * Pass `--tag` to actually create the GA tag, `--push` to push to origin.
 */
import { execSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const doTag = args.has('--tag');
const doPush = args.has('--push');
const TAG = 'v0.3.0';
const MSG = 'v0.3.0 GA';

function run(cmd) {
  console.log(`\n[release-ga] $ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (err) {
    console.error(`[release-ga] FAIL: ${cmd}`);
    process.exit(1);
  }
}

console.log('[release-ga] running v0.3.0 GA acceptance checklist…');
run('npx tsc --noEmit');
run('npm run lint');
run('npm run build');
// Ship-time gates first — fail fast on architecture/legacy regressions
// before paying the calibration sweep cost.
run('npm run gates');
// Corpus calibration — M-CALIB-1 (Wilson lower ≥ 0.7, recall ≥ 0.6).
run('npm run calibrate');
// Full test suite.
run('npx vitest run');
// Tarball size + shape — covered by `tests/ship/tarball-shape.test.ts` already
// inside `npm run gates`, but rerun as a reminder of the artifact.
run('npm run pack:size');

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
