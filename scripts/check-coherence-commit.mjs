#!/usr/bin/env node
/**
 * Enforces conventional-commits AND the [coherence] prefix rule for tool-emitted commits.
 * DD-005, FR-PERMISSION-4
 */
import { readFileSync } from 'fs';

const msgFile = process.argv[2];
if (!msgFile) {
  console.error('Usage: check-coherence-commit.mjs <commit-msg-file>');
  process.exit(1);
}

const msg = readFileSync(msgFile, 'utf8').trim();
// Strip comments
const body = msg.split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
const firstLine = body.split('\n')[0];

// [coherence] prefixed commits are tool-emitted — allowed unconditionally
if (firstLine.startsWith('[coherence]')) {
  process.exit(0);
}

// Conventional commit pattern
const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .+/;

if (!CONVENTIONAL.test(firstLine)) {
  console.error(
    `\n[coherence] commit-msg hook: commit message must start with a conventional-commits type\n` +
    `  e.g.: feat: add anchor scanner\n` +
    `  or use the [coherence] prefix for tool-emitted commits\n\n` +
    `  Received: "${firstLine}"\n`
  );
  process.exit(1);
}

process.exit(0);
