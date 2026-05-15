#!/usr/bin/env node
/**
 * Install-smoke (D3): prove that the *published* plugin actually installs
 * and loads, end-to-end, from a tag-pinned marketplace. Runs locally
 * (against the working tree) and in CI (against the live GitHub tag).
 *
 * Usage:
 *   node scripts/install-smoke.mjs --tag v1.1.0
 *   node scripts/install-smoke.mjs --local
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const tagIdx = argv.indexOf('--tag');
const tag = tagIdx >= 0 ? argv[tagIdx + 1] : null;
const local = argv.includes('--local');
const repo = process.env.COHERENCE_SMOKE_REPO ?? 'HUMBLEF0OL/coherence';

function sh(cmd, args, opts = {}) {
  console.log('$', cmd, args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.status !== 0) {
    console.error(`FAIL (exit=${r.status}): ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

function shCapture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

if (!local && !tag) {
  console.error('Usage: install-smoke.mjs --local | --tag <v1.x.y>');
  process.exit(1);
}

if (local) {
  sh('claude', ['plugin', 'marketplace', 'add', rootDir, '--scope', 'local']);
} else {
  sh('claude', ['plugin', 'marketplace', 'add', `${repo}@${tag}`]);
}

sh('claude', ['plugin', 'install', 'coherence@coherence', '--scope', 'local']);

const details = shCapture('claude', ['plugin', 'details', 'coherence@coherence']);
if (details.status !== 0) {
  console.error('plugin details failed');
  console.error(details.stdout);
  console.error(details.stderr);
  process.exit(1);
}
const hooksOk = /Hooks \(\d+\)/.test(details.stdout);
if (!hooksOk) {
  console.error('hooks count not detected in details output');
  console.error(details.stdout);
  process.exit(1);
}
console.log(`[install-smoke] PASS: ${tag ?? '(local)'}`);

// Best-effort cleanup; ignore failures so a transient error doesn't mask the
// PASS above.
spawnSync('claude', ['plugin', 'uninstall', 'coherence@coherence', '--scope', 'local', '--yes'], {
  stdio: 'inherit',
});
spawnSync('claude', ['plugin', 'marketplace', 'remove', 'coherence'], { stdio: 'inherit' });
