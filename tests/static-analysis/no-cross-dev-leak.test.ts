/**
 * v0.3 M6 — M-PRIVACY-1 ship-time gate (NFR-PRIVACY-N5, DD-109).
 *
 * Asserts:
 *   1. No `src/` codepath writes `signal-cache.json` or `session-map.json`
 *      under any path that starts with the user-owned `coherence/` root —
 *      only `.claude/coherence/` (gitignored) writes are allowed.
 *   2. The first-run `.gitignore` patcher emits the per-developer state
 *      lines that NFR-PRIVACY-N5 mandates (`signal-cache.json`,
 *      `session-map.json`).
 *
 * The gate enforces the "developer-private state stays per-developer"
 * invariant — a teammate's clone must not pull in another's hashed signal
 * data via `git pull`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

describe('M-PRIVACY-1: cross-developer-leak prevention (NFR-PRIVACY-N5, DD-109)', () => {
  it('no codepath writes signal-cache.json or session-map.json under coherence/ (committed)', () => {
    const offenders: string[] = [];
    const targets = ['signal-cache.json', 'session-map.json'];
    const files = walk(SRC);

    for (const file of files) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      const text = readFileSync(file, 'utf8');
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
        for (const t of targets) {
          if (line.includes(t)) {
            // The literal string is OK if surrounded by `.claude/coherence/`
            // or if it's the bare filename used inside StateStore (which
            // already roots writes at `.claude/coherence/`).
            const inClaude =
              line.includes('.claude/coherence/') ||
              line.includes('.claude\\\\coherence\\\\') ||
              // bare-filename usage: pathFilter, stateStore, init helpers
              // hand the filename to a StateStore rooted at .claude/coherence/.
              /['"`]signal-cache\.json['"`]|['"`]session-map\.json['"`]/.test(line);
            const inCommittedRoot = /(['"`]coherence\/|coherence\\\\).*?(?:signal-cache|session-map)/.test(
              line,
            );
            if (inCommittedRoot && !inClaude) {
              offenders.push(`${rel}:${i + 1}\t${line.trim()}`);
            }
          }
        }
      }
    }

    expect(
      offenders,
      `M-PRIVACY-1: per-developer state written under committed coherence/:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('firstRun.ts patches .gitignore for both per-developer state files', () => {
    const text = readFileSync(path.join(SRC, 'state', 'firstRun.ts'), 'utf8');
    expect(text).toContain('signal-cache.json');
    expect(text).toContain('session-map.json');
    expect(text).toContain('# cohrence — per-developer state (do not commit)');
  });
});
