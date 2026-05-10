#!/usr/bin/env node
/**
 * v0.2-alpha release script (G4 fix, M8 deliverable).
 *
 * Runs the v0.2 acceptance checklist locally:
 *   - typecheck
 *   - full vitest suite
 *   - build
 *
 * Pass `--tag` to actually create the signed tag after gates pass.
 * Pass `--push` together with `--tag` to push to origin. Default behaviour
 * (no flags) prints the commands so they can be run manually.
 */
import { execSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const doTag = args.has('--tag');
const doPush = args.has('--push');
const TAG = 'v0.2-alpha';
const MSG = 'v0.2-alpha';

function run(cmd) {
  console.log(`\n[release-alpha] $ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (err) {
    console.error(`[release-alpha] FAIL: ${cmd}`);
    process.exit(1);
  }
}

console.log('[release-alpha] running v0.2 acceptance checklist…');
run('npx tsc --noEmit');
run('npx vitest run');
run('npm run build');

if (doTag) {
  console.log('\n[release-alpha] all gates green — cutting tag.');
  run(`git tag -s ${TAG} -m "${MSG}"`);
  if (doPush) {
    run(`git push origin ${TAG}`);
  } else {
    console.log(`\n[release-alpha] tag created locally. To publish: git push origin ${TAG}`);
  }
} else {
  console.log('\n[release-alpha] all gates green. To cut the tag, re-run with --tag (and optionally --push):');
  console.log(`  node scripts/release-alpha.mjs --tag --push`);
  console.log('Manual equivalents:');
  console.log(`  git tag -s ${TAG} -m "${MSG}"`);
  console.log(`  git push origin ${TAG}`);
}
