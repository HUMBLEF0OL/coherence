#!/usr/bin/env node
/**
 * v0.2.0 GA release script (G4 fix, M10 deliverable).
 *
 * Same checklist as release-alpha plus the e2e acceptance suite + final
 * SG sweep. Refuses to tag if any gate is red.
 */
import { execSync } from 'node:child_process';

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
console.log('\n[release-ga] all gates green. To cut the GA tag:');
console.log('  git tag -s v0.2.0 -m "v0.2.0 GA"');
console.log('  git push origin v0.2.0');
console.log('\n[release-ga] reminder: DD-092 v0.2.1 calibration patch is a hard post-GA deliverable.');
