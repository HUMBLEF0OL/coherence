/**
 * v0.3 M6 — round-2 P7 meta-test: gate sensitivity check.
 *
 * Programmatically introduces a transient regression for each ship-time gate
 * and asserts the gate would actually trip on it. Runs the gate logic in
 * isolation against tmp fixtures; does NOT mutate the real `src/` tree.
 *
 * Why this exists: the real ship-time gates only fire on real regressions.
 * A silently-broken gate (always-pass) would slip past CI. This meta-test
 * reverse-engineers each gate's failure mode and asserts it triggers.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, statSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-meta-gates-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Re-implementation of the no-network gate's scan loop, exposed here as a
 * pure function so the meta-test can run it against a fixture. Keeps the
 * meta-test independent of vitest's expect propagation.
 */
function detectNetworkOffenders(srcDir: string): string[] {
  const NETWORK_API_RE = /\b(?:node:)?(?:http|https|net|tls|dgram|dns)\b/;
  const NETWORK_GLOBAL_RE = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/;

  const out: string[] = [];
  function walk(d: string): void {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (full.endsWith('.ts')) {
        const lines = readFileSync(full, 'utf8').split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
          if (/^\s*import\s.+from\s+['"]([^'"]+)['"]/.test(line)) {
            const t = line.match(/from\s+['"]([^'"]+)['"]/)?.[1] ?? '';
            if (NETWORK_API_RE.test(t)) out.push(`${full}:${i + 1}`);
          } else if (NETWORK_GLOBAL_RE.test(line)) {
            out.push(`${full}:${i + 1}`);
          }
        }
      }
    }
  }
  walk(srcDir);
  return out;
}

function detectPrivacyOffenders(srcDir: string): string[] {
  const targets = ['signal-cache.json', 'session-map.json'];
  const out: string[] = [];
  function walk(d: string): void {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (full.endsWith('.ts')) {
        const text = readFileSync(full, 'utf8');
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
          for (const t of targets) {
            if (line.includes(t)) {
              const inCommittedRoot = /(['"`]coherence\/|coherence\\\\).*?(?:signal-cache|session-map)/.test(
                line,
              );
              const inClaude = line.includes('.claude/coherence/');
              if (inCommittedRoot && !inClaude) {
                out.push(`${full}:${i + 1}`);
              }
            }
          }
        }
      }
    }
  }
  walk(srcDir);
  return out;
}

describe('round-2 P7 — meta-gates trip on synthetic regressions', () => {
  it('no-network gate trips on a synthetic `import "node:http"`', () => {
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(
      path.join(dir, 'src', 'offender.ts'),
      "import { request } from 'node:http';\nconst x = request;\n",
      'utf8',
    );
    const offenders = detectNetworkOffenders(path.join(dir, 'src'));
    expect(offenders.length).toBeGreaterThan(0);
  });

  it('no-network gate trips on a synthetic `fetch(...)` call', () => {
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(
      path.join(dir, 'src', 'offender.ts'),
      "async function leak() { return fetch('https://anywhere');\n}\n",
      'utf8',
    );
    const offenders = detectNetworkOffenders(path.join(dir, 'src'));
    expect(offenders.length).toBeGreaterThan(0);
  });

  it('no-cross-dev-leak gate trips on a synthetic write to coherence/signal-cache.json', () => {
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(
      path.join(dir, 'src', 'offender.ts'),
      "writeFileSync('coherence/signal-cache.json', JSON.stringify({}));\n",
      'utf8',
    );
    const offenders = detectPrivacyOffenders(path.join(dir, 'src'));
    expect(offenders.length).toBeGreaterThan(0);
  });

  it('no-cross-dev-leak gate accepts the canonical `.claude/coherence/signal-cache.json` line', () => {
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(
      path.join(dir, 'src', 'ok.ts'),
      "const p = '.claude/coherence/signal-cache.json';\n",
      'utf8',
    );
    const offenders = detectPrivacyOffenders(path.join(dir, 'src'));
    expect(offenders).toEqual([]);
  });
});
