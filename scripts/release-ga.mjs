#!/usr/bin/env node
/**
 * v0.2.0 GA release script (G4 fix, M10 deliverable).
 *
 * Same checklist as release-alpha plus the e2e acceptance suite + final
 * SG sweep. Pass `--tag` to actually create the signed tag, `--push` to
 * push to origin.
 */
import { execSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const doTag = args.has('--tag');
const doPush = args.has('--push');
const TAG = 'v0.2.0';
const MSG = 'v0.2.0 GA';

function run(cmd) {
  console.log(`\n[release-ga] $ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (err) {
    console.error(`[release-ga] FAIL: ${cmd}`);
    process.exit(1);
  }
}

console.log('[release-ga] running v0.2.0 GA acceptance checklist…');
run('npx tsc --noEmit');
run('npx vitest run');
run('npx vitest run tests/e2e tests/security/v0.2');
run('npm run build');

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
console.log('\n[release-ga] reminder: DD-092 v0.2.1 calibration patch is a hard post-GA deliverable.');
