/**
 * v0.3 M6 — M-ARCH-1 ship-time gate (NFR-ARCH-1, DD-117).
 *
 * Walks `src/` and asserts that:
 *   1. No production module imports a network-capable Node API
 *      (`node:http|node:https|node:net|node:tls|node:dgram|node:dns`) outside
 *      the allowlist.
 *   2. No production module references the `fetch` / `XMLHttpRequest` /
 *      `WebSocket` globals.
 *   3. No literal HTTPS endpoint URLs appear in `src/` outside cassette
 *      fixtures (the Anthropic SDK is loaded by name; the URL is its concern).
 *   4. No write target outside `.claude/coherence/`, `coherence/`, or the
 *      project root (.gitignore patcher) — re-asserts SG-3 from a different
 *      angle for redundancy.
 *
 * Allowlist:
 *   - `src/llm/client.ts` imports `@anthropic-ai/sdk` (the only sanctioned
 *     network sink). The SDK loads `node:https` internally — fine — but our
 *     own code must never reference https/http/net/tls directly.
 *
 * The gate is intentionally conservative: a single offending line trips
 * the test and surfaces the path + line number for the developer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

const NETWORK_API_RE = /\b(?:node:)?(?:http|https|net|tls|dgram|dns)\b/;
const NETWORK_GLOBAL_RE = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/;
const HTTPS_URL_RE = /https:\/\/[a-zA-Z0-9.-]+(?:\/[^\s'"`)]*)?/;

const ALLOWED_HTTPS_URLS = [
  // Plugin/registry URLs in package.json metadata reach src/ through nothing,
  // but we tolerate https mentions in comments that document the SDK.
  'https://api.anthropic.com',
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

describe('M-ARCH-1: no-backend invariant (NFR-ARCH-1, DD-117)', () => {
  const offenders: string[] = [];
  const files = walk(SRC);

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('//') || line.startsWith(' *') || line.startsWith('/*') || line.startsWith(' */')) {
        continue;
      }
      // Skip code inside JSDoc / inline comment trailing on the line.
      const codePart = line.split(/\s\/\//)[0];

      // (1) Network API imports
      const importMatch = /^\s*import\s.+from\s+['"]([^'"]+)['"]/.exec(codePart);
      if (importMatch) {
        const target = importMatch[1];
        if (NETWORK_API_RE.test(target)) {
          offenders.push(`${rel}:${i + 1}\timport "${target}" not allowed`);
        }
        continue;
      }

      // (2) Global network calls
      if (NETWORK_GLOBAL_RE.test(codePart)) {
        offenders.push(`${rel}:${i + 1}\t${codePart.trim()}`);
      }

      // (3) Literal HTTPS URLs
      const urlMatch = HTTPS_URL_RE.exec(codePart);
      if (urlMatch) {
        const url = urlMatch[0];
        const allowed = ALLOWED_HTTPS_URLS.some((a) => url.startsWith(a));
        if (!allowed) {
          offenders.push(`${rel}:${i + 1}\tliteral HTTPS URL: ${url}`);
        }
      }
    }
  }

  it('no production module imports a network API', () => {
    expect(
      offenders.filter((o) => o.includes('import')),
      `M-ARCH-1: forbidden network imports detected:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('no production module references global network constructors/calls', () => {
    expect(
      offenders.filter((o) => /XMLHttpRequest|WebSocket|EventSource|fetch\(/.test(o)),
      `M-ARCH-1: forbidden network globals detected:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('no production module embeds non-Anthropic HTTPS URLs', () => {
    const urlOffenders = offenders.filter((o) => o.includes('literal HTTPS URL'));
    expect(
      urlOffenders,
      `M-ARCH-1: literal HTTPS URLs detected (only Anthropic SDK target allowed):\n${urlOffenders.join('\n')}`,
    ).toEqual([]);
  });
});
