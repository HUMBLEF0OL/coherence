/**
 * v1.0 M4 — SECURITY.md presence + structural test (M-SIGN-3).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SECURITY_MD = path.join(ROOT, 'SECURITY.md');

describe('SECURITY.md (M-SIGN-3)', () => {
  it('exists at project root', () => {
    expect(existsSync(SECURITY_MD)).toBe(true);
  });

  it('contains the three required headings', () => {
    const raw = readFileSync(SECURITY_MD, 'utf8');
    expect(raw).toMatch(/^##\s+Reporting a Vulnerability/m);
    expect(raw).toMatch(/^##\s+Disclosure Policy/m);
    expect(raw).toMatch(/^##\s+Supported Versions/m);
  });

  it('mentions GitHub Security Advisories as a fallback path', () => {
    const raw = readFileSync(SECURITY_MD, 'utf8');
    expect(raw.toLowerCase()).toContain('security advisor');
  });
});
