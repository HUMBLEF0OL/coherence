/**
 * v1.0.1 M1 — embedded-version scanner regression test.
 *
 * Closes the bug class behind v1.0.1 Fix 2 (`DEFAULT_PLUGIN_VERSION =
 * '0.4.0'` hardcoded in `src/state/consent.ts`). The scanner walks a
 * source tree looking for SemVer-shaped literals on lines that also
 * reference an identifier containing `version` and reports any that
 * don't match the canonical version.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { scanEmbeddedVersions, EMBEDDED_VERSION_ALLOWLIST } from '../../../scripts/lib/version-scanner.mjs';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-version-scanner-'));
});

afterEach(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
});

function seed(rel: string, content: string): void {
  const full = path.join(tmp, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

describe('scanEmbeddedVersions — happy paths', () => {
  it('returns empty when no SemVer literals exist', () => {
    seed('a.ts', "export const x = 'hello';\n");
    expect(scanEmbeddedVersions(tmp, '1.0.0')).toEqual([]);
  });

  it('returns empty when every SemVer literal already matches the canonical', () => {
    seed('a.ts', "export const PLUGIN_VERSION = '1.0.0';\n");
    expect(scanEmbeddedVersions(tmp, '1.0.0')).toEqual([]);
  });

  it('skips lines that have a SemVer literal but no *version* identifier', () => {
    // Dep pin "^4.5.0" or arbitrary-version error messages should not trip.
    seed('a.ts', "throw new Error('TypeScript 5.6.3 is required');\n");
    expect(scanEmbeddedVersions(tmp, '1.0.0')).toEqual([]);
  });
});

describe('scanEmbeddedVersions — the BUG-V1.0-C bug class', () => {
  it('flags `DEFAULT_PLUGIN_VERSION = "0.4.0"` (the exact Fix 2 bug)', () => {
    seed('state/consent.ts', "const DEFAULT_PLUGIN_VERSION = '0.4.0';\n");
    const findings = scanEmbeddedVersions(tmp, '1.0.1');
    expect(findings).toHaveLength(1);
    expect(findings[0].value).toBe('0.4.0');
    expect(findings[0].file).toMatch(/state[/\\]consent\.ts$/);
    expect(findings[0].line).toBe(1);
    expect(findings[0].snippet).toMatch(/DEFAULT_PLUGIN_VERSION/);
  });

  it('flags a `pluginVersion = "0.1.0"` parameter default', () => {
    seed('a.ts',
      'export function recordTelemetryConsent(\n' +
      '  store: Store,\n' +
      "  pluginVersion: string = '0.1.0',\n" +
      ') {}\n',
    );
    const findings = scanEmbeddedVersions(tmp, '1.0.1');
    expect(findings).toHaveLength(1);
    expect(findings[0].value).toBe('0.1.0');
    expect(findings[0].line).toBe(3);
  });

  it('flags status-command fallback `version?.plugin_version ?? "0.1.0"`', () => {
    seed('commands/status.ts',
      "lines.push(`status — plugin ${version?.plugin_version ?? '0.1.0'} | mode`);\n",
    );
    const findings = scanEmbeddedVersions(tmp, '1.0.1');
    expect(findings).toHaveLength(1);
    expect(findings[0].value).toBe('0.1.0');
  });

  it('flags multiple stale literals across multiple files', () => {
    seed('a.ts', "export const A_VERSION = '0.4.0';\n");
    seed('nested/b.ts', "const someVersionConst = '0.3.5';\n");
    const findings = scanEmbeddedVersions(tmp, '1.0.0');
    expect(findings).toHaveLength(2);
    const values = new Set(findings.map((f) => f.value));
    expect(values.has('0.4.0')).toBe(true);
    expect(values.has('0.3.5')).toBe(true);
  });
});

describe('scanEmbeddedVersions — false-positive control', () => {
  it('skips comment lines that mention stale versions', () => {
    seed('a.ts',
      "// the v0.4.0 default used to be '0.4.0' — fixed in v1.0.1\n" +
      "export const PLUGIN_VERSION = '1.0.1';\n",
    );
    // The comment line has the SemVer literal but it's a comment — skip.
    // The export line matches the canonical — skip.
    expect(scanEmbeddedVersions(tmp, '1.0.1')).toEqual([]);
  });

  it('skips block-comment continuation lines that start with *', () => {
    seed('a.ts',
      '/**\n' +
      " * version handling: previously '0.1.0' default.\n" +
      ' */\n' +
      "export const X = '1.0.1';\n",
    );
    expect(scanEmbeddedVersions(tmp, '1.0.1')).toEqual([]);
  });

  it('flags template-literal versions inside string templates', () => {
    // Single line: const msg = `plugin version: ${'0.4.0'}`;
    seed('a.ts', "const msg = `plugin version: ${'0.4.0'}`;\n");
    const findings = scanEmbeddedVersions(tmp, '1.0.1');
    expect(findings).toHaveLength(1);
    expect(findings[0].value).toBe('0.4.0');
  });

  it('does NOT flag SemVer-shaped literals in dependency pin contexts', () => {
    // No "version" identifier on the line → skip even though "4.5.0" is SemVer.
    seed('a.ts', "import express from 'express'; // ^4.5.0\n");
    expect(scanEmbeddedVersions(tmp, '1.0.0')).toEqual([]);
  });

  it('does NOT recurse into node_modules / dist / .git directories', () => {
    seed('node_modules/foo/x.ts', "export const x_version = '9.9.9';\n");
    seed('dist/y.ts', "export const y_version = '9.9.9';\n");
    seed('.git/z.ts', "export const z_version = '9.9.9';\n");
    seed('real/r.ts', "export const r_version = '9.9.9';\n");
    const findings = scanEmbeddedVersions(tmp, '1.0.0');
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toMatch(/real[/\\]r\.ts$/);
  });

  it('does NOT scan .d.ts files (they are generated declarations)', () => {
    seed('a.d.ts', "export const someVersion: string;  // hint: '0.4.0'\n");
    seed('a.ts', "export const someVersion = '1.0.0';\n");
    expect(scanEmbeddedVersions(tmp, '1.0.0')).toEqual([]);
  });
});

describe('scanEmbeddedVersions — robustness', () => {
  it('handles a missing source dir gracefully', () => {
    expect(scanEmbeddedVersions(path.join(tmp, 'does-not-exist'), '1.0.0')).toEqual([]);
  });

  it('handles files with CRLF line endings (line-number reporting still correct)', () => {
    seed('a.ts', "// line 1\r\nconst BAD_VERSION = '0.4.0';\r\n");
    const findings = scanEmbeddedVersions(tmp, '1.0.1');
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(2);
  });

  it('reports every match on a line with multiple SemVer literals', () => {
    seed('a.ts',
      "// migration: rewrite_version_pair('0.3.0', '0.4.0') would have caught this\n" +
      "const versionPair = ['0.3.0', '0.4.0'];\n",
    );
    const findings = scanEmbeddedVersions(tmp, '1.0.0');
    // The comment line is skipped; the code line yields TWO findings.
    expect(findings).toHaveLength(2);
    const values = findings.map((f) => f.value).sort();
    expect(values).toEqual(['0.3.0', '0.4.0']);
  });
});

describe('scanEmbeddedVersions — current coherence src must be clean', () => {
  // This test runs the scanner against the REAL `src/` tree. It's the
  // M1 release-pipeline gate — if it fails, a developer just introduced
  // an embedded version literal that drifts from the canonical version.
  it('produces zero non-allowlisted findings against the live src/ tree at the canonical version', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
    const raw = scanEmbeddedVersions(
      path.resolve(__dirname, '..', '..', '..', 'src'),
      pkg.version,
    );
    const findings = raw.filter((f) => !EMBEDDED_VERSION_ALLOWLIST.has(`${f.file}:${f.line}`));
    if (findings.length > 0) {
      const detail = findings.map((f) => `  ${f.file}:${f.line}  value='${f.value}'\n    ${f.snippet}`).join('\n');
      throw new Error(
        `Embedded version constants drift from canonical ${pkg.version}:\n${detail}\n\n` +
        `Each occurrence is a SemVer string in a line that also names \`*version*\`.\n` +
        `If the literal is intentional, add \`<file>:<line>\` to EMBEDDED_VERSION_ALLOWLIST\n` +
        `in scripts/lib/version-scanner.mjs with an explanatory comment.`,
      );
    }
    expect(findings).toEqual([]);
  });
});
