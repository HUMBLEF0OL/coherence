/**
 * Release script — runs BRD-4 §4.9 acceptance checklist.
 * Tags release-v0.1.0 only if every check passes.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const checks = [];
let allPassed = true;

function check(name, fn) {
  try {
    const result = fn();
    if (result === false) {
      console.error(`  ✗ ${name}`);
      allPassed = false;
    } else {
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    allPassed = false;
  }
}

function run(cmd) {
  return execSync(cmd, { cwd: PROJECT_ROOT, shell: true, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

console.log('[release] BRD-4 §4.9 Acceptance Checklist\n');

// 1. TypeScript type check
check('TypeScript compiles without errors', () => {
  run('npx tsc --noEmit');
});

// 2. All tests pass
check('All tests green (vitest run)', () => {
  run('npx vitest run');
});

// 3. DD coverage
check('CHANGELOG.md covers DD-001..DD-064', () => {
  run('node scripts/changelog-dd-coverage.mjs');
});

// 4. Install size
check('Install size check', () => {
  run('npx vitest run --project perf tests/perf/install-size.test.ts');
});

// 5. Documentation files exist
check('DG-1 docs/README.md exists', () => existsSync(path.join(PROJECT_ROOT, 'docs', 'README.md')));
check('DG-2 docs/commands.md exists', () => existsSync(path.join(PROJECT_ROOT, 'docs', 'commands.md')));
check('DG-3 docs/state-files.md exists', () => existsSync(path.join(PROJECT_ROOT, 'docs', 'state-files.md')));
check('DG-4 docs/rollback.md exists', () => existsSync(path.join(PROJECT_ROOT, 'docs', 'rollback.md')));
check('DG-5 CHANGELOG.md exists', () => existsSync(path.join(PROJECT_ROOT, 'CHANGELOG.md')));
check('DG-6 docs/privacy.md exists', () => existsSync(path.join(PROJECT_ROOT, 'docs', 'privacy.md')));

// 6. No hardcoded secrets
check('SG-4: no hardcoded secrets', () => {
  run('npx vitest run --project security tests/security/secrets.test.ts');
});

// 7. Network egress gate
check('NFR-PRIVACY-3: network egress gate', () => {
  run('npx vitest run --project security tests/security/network-egress.test.ts');
});

console.log('');
if (!allPassed) {
  console.error('[release] FAIL — not all checklist items passed. Release aborted.');
  process.exit(1);
}

console.log('[release] All checks passed!');

// Tag release
if (process.argv.includes('--tag')) {
  try {
    run('git tag -a release-v0.1.0 -m "Release v0.1.0"');
    console.log('[release] Tagged release-v0.1.0');
  } catch {
    console.warn('[release] Tagging failed (may already exist or git not configured)');
  }
} else {
  console.log('[release] Run with --tag to create the release-v0.1.0 git tag.');
}
