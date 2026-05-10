#!/usr/bin/env node
/**
 * v0.2-alpha release script (G4 fix, M8 deliverable).
 *
 * Runs the v0.2 acceptance checklist locally:
 *   - typecheck
 *   - full vitest suite
 *   - build
 *
 * Refuses to tag if any step is red. The actual `git tag` step is left
 * to a manual confirmation since it mutates the user's git state.
 */
import { execSync } from 'node:child_process';

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
console.log('\n[release-alpha] all gates green. To cut the tag:');
console.log('  git tag -s v0.2-alpha -m "v0.2-alpha"');
console.log('  git push origin v0.2-alpha');
