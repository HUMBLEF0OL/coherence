#!/usr/bin/env node
/**
 * v0.4 M0 — thin wrapper around `claude plugin validate`.
 * Exits non-zero on validation failure.
 *
 * The `claude plugin validate` command (Claude Code 2.x+) requires the path
 * to the plugin root (the directory that contains `.claude-plugin/`).
 */
import { spawnSync } from 'child_process';

const result = spawnSync('claude', ['plugin', 'validate', '.'], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
