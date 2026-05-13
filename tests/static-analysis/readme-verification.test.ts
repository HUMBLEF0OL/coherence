/**
 * v1.0 M4 — README ## Verification section structural test (M-SIGN-3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const README = path.join(ROOT, 'README.md');

describe('README ## Verification (M-SIGN-3)', () => {
  const raw = readFileSync(README, 'utf8');

  it('contains the BEGIN/END markers', () => {
    expect(raw).toContain('<!-- BEGIN: coherence-verification -->');
    expect(raw).toContain('<!-- END: coherence-verification -->');
  });

  it('block between markers references cosign verify-blob', () => {
    const m = raw.match(/<!-- BEGIN: coherence-verification -->([\s\S]*?)<!-- END: coherence-verification -->/);
    expect(m).not.toBeNull();
    const block = m![1];
    expect(block).toContain('cosign verify-blob');
    expect(block).toContain('--certificate-identity-regexp');
    expect(block).toContain('--certificate-oidc-issuer');
  });

  it('block references Rekor transparency log', () => {
    expect(raw).toContain('search.sigstore.dev');
  });

  it('block names the M6 / M-SIGN gate names', () => {
    expect(raw).toMatch(/M-SIGN-[123]/);
  });
});
