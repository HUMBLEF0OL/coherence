/**
 * v1.0.1 regression — README cosign verification block renders verbatim
 * even though the embedded `--certificate-identity-regexp` value ends in
 * `$'` (regex end-of-string anchor followed by closing quote).
 *
 * Pre-fix bug: `readme.replace(re, replacement)` interpreted `$'` inside
 * `replacement` as a `String.prototype.replace` backreference token,
 * mangling the rendered regex. Fix in `cb52271` switched to a function
 * replacer `() => replacement`. This test guards against re-introduction.
 */
import { describe, it, expect } from 'vitest';
import {
  renderVerification,
  buildVerificationBlock,
} from '../../../scripts/render-readme-verification.mjs';

const PKG = {
  name: 'coherence',
  version: '1.0.1',
  repository: { type: 'git', url: 'git+https://github.com/HUMBLEF0OL/coherence.git' },
};

describe('render-readme-verification — regex backreference regression', () => {
  it('renders the literal `tags/v.*$` anchor verbatim (no $-backref expansion)', () => {
    // README pre-seeded with a verification block — the replace path
    // (NOT the append path) is the codepath that triggered the bug.
    const seeded = [
      '# Coherence',
      '',
      '## Verification',
      '',
      '<!-- BEGIN: coherence-verification -->',
      'STALE BLOCK CONTENT',
      '<!-- END: coherence-verification -->',
      '',
    ].join('\n');

    const out = renderVerification(seeded, PKG);
    expect(out).not.toBeNull();
    // The identity regex must contain the literal `tags/v.*$` anchor.
    // Pre-fix bug: `$` would be expanded as $& (full match) or $' (right
    // context), producing a corrupted line containing the BEGIN marker
    // or the rest of the README rather than the literal anchor.
    expect(out).toContain("tags/v.*$'");
    // Defense-in-depth: none of the $-token sequences leaked into output
    // (no `$&`, no `$1`, and the only `$'` is the legitimate
    // anchor+closing-quote inside the regex literal).
    expect(out).not.toContain('$&');
    expect(out).not.toContain('$1');
    // The full identity regex line is intact on a single line.
    expect(out).toMatch(
      /--certificate-identity-regexp '\^https:\/\/github\.com\/HUMBLEF0OL\/coherence\/\\\.github\/workflows\/release\\\.yml@refs\/tags\/v\.\*\$'/,
    );
    // BEGIN/END markers preserved.
    expect(out).toContain('<!-- BEGIN: coherence-verification -->');
    expect(out).toContain('<!-- END: coherence-verification -->');
    // The stale content has been replaced.
    expect(out).not.toContain('STALE BLOCK CONTENT');
  });

  it('appends a fresh Verification section when markers are absent', () => {
    const seeded = '# Coherence\n\nNo verification block yet.\n';
    const out = renderVerification(seeded, PKG);
    expect(out).not.toBeNull();
    expect(out).toContain('## Verification');
    expect(out).toContain('<!-- BEGIN: coherence-verification -->');
    expect(out).toContain('<!-- END: coherence-verification -->');
    expect(out).toContain("tags/v.*$'");
  });

  it('idempotent: running the render twice produces identical output', () => {
    const seeded = [
      '# Coherence',
      '',
      '<!-- BEGIN: coherence-verification -->',
      'stale',
      '<!-- END: coherence-verification -->',
      '',
    ].join('\n');
    const once = renderVerification(seeded, PKG);
    const twice = renderVerification(once, PKG);
    expect(twice).toBe(once);
  });

  it('returns null when repository.url is missing', () => {
    const noRepo = { name: 'coherence', version: '1.0.1' };
    expect(renderVerification('# X', noRepo)).toBeNull();
    expect(buildVerificationBlock(noRepo)).toBeNull();
  });

  it('returns null when repository.url is not a GitHub URL', () => {
    const gitlab = {
      name: 'coherence',
      version: '1.0.1',
      repository: { url: 'git+https://gitlab.com/x/y.git' },
    };
    expect(renderVerification('# X', gitlab)).toBeNull();
  });

  it('derives owner/repo from the SSH form of repository.url', () => {
    const ssh = {
      name: 'coherence',
      version: '1.0.1',
      repository: { url: 'git@github.com:HUMBLEF0OL/coherence.git' },
    };
    const built = buildVerificationBlock(ssh);
    expect(built).not.toBeNull();
    expect(built!.owner).toBe('HUMBLEF0OL');
    expect(built!.repo).toBe('coherence');
  });

  it('embeds package name and version in the tarball filename, not the repo name', () => {
    // M-SIGN-3 consequence: the npm tarball uses `${name}-${version}.tgz`,
    // not `${repo}-${version}.tgz`. We assert the tarball filename derives
    // from package.name by using a diverging repo name in a synthetic
    // fixture (the real repo + package name align as `coherence` post-C1).
    const diverged = {
      name: 'my-pkg',
      version: '1.0.1',
      repository: { url: 'git+https://github.com/HUMBLEF0OL/coherence.git' },
    };
    const out = renderVerification('# x\n', diverged)!;
    expect(out).toContain('my-pkg-1.0.1.tgz');
    expect(out).not.toContain('coherence-1.0.1.tgz');
  });
});
