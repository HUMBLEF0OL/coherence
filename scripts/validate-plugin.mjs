#!/usr/bin/env node
/**
 * v0.4 M0 — thin wrapper around `claude plugin validate`.
 * Exits non-zero on validation failure.
 */
import { spawnSync } from 'child_process';

const result = spawnSync('claude', ['plugin', 'validate'], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
