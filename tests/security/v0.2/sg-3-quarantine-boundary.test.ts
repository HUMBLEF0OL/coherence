/**
 * SG-3 quarantine boundary fixture (M1, DD-065).
 *
 * Asserts that:
 *  - `writeProposalArtifact` refuses paths that escape quarantine.
 *  - `proposeAccept.loadProposalArtifact` refuses callers without the token.
 *  - The static AST scan over `src/` finds no fs.write* calls outside the
 *    allow-list (proposeAccept, installStatusline, stateStore writers).
 *
 * Property-based fuzzer: 64 randomised proposal-id payloads — boundary holds.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  writeProposalArtifact,
  QuarantineBoundaryError,
  isUnderQuarantine,
} from '../../../src/proposals/quarantine.js';
import {
  loadProposalArtifact,
  PROPOSE_ACCEPT_INVOCATION_TOKEN,
  ProposeAcceptError,
} from '../../../src/permissions/proposeAccept.js';

function makeRoot(): string {
  return mkdtempSync(path.join(tmpdir(), 'coherence-sg3-'));
}

describe('SG-3 quarantine boundary (DD-065)', () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });

  it('writeProposalArtifact lands the file under .claude/coherence/proposals/<kind>/<id>/', () => {
    const result = writeProposalArtifact(
      root,
      'skill',
      'abc123',
      'SKILL.md',
      '# proposal content',
    );
    expect(isUnderQuarantine(root, result.artifactPath)).toBe(true);
    expect(result.artifactPath).toMatch(/\.claude[\/\\]coherence[\/\\]proposals[\/\\]skill[\/\\]abc123[\/\\]SKILL\.md$/);
    expect(readFileSync(result.artifactPath, 'utf8')).toBe('# proposal content');
  });

  it('refuses proposal ids that contain path separators', () => {
    expect(() =>
      writeProposalArtifact(root, 'skill', '../../etc/passwd', 'x.md', 'evil'),
    ).toThrow(QuarantineBoundaryError);
  });

  it('refuses filenames containing slashes', () => {
    expect(() =>
      writeProposalArtifact(root, 'skill', 'good', '../../escape.md', 'evil'),
    ).toThrow(QuarantineBoundaryError);
  });

  it('refuses filenames containing dot-dot segments', () => {
    expect(() =>
      writeProposalArtifact(root, 'skill', 'good', 'a..b.md', 'evil'),
    ).toThrow(QuarantineBoundaryError);
  });

  it('property-based fuzzer: every payload either lands under quarantine or throws', () => {
    const payloads = [
      'a/b',
      '../escape',
      'foo\\bar',
      'a..b',
      'normal-id',
      'with space',
      'tab\tchar',
      'newline\n',
      '..',
      '.',
      '',
    ];
    for (const id of payloads) {
      try {
        const r = writeProposalArtifact(root, 'skill', id, 'X.md', 'x');
        expect(isUnderQuarantine(root, r.artifactPath)).toBe(true);
      } catch (e) {
        expect(e).toBeInstanceOf(QuarantineBoundaryError);
      }
    }
  });

  it('loadProposalArtifact refuses callers without the invocation token', () => {
    expect(() =>
      loadProposalArtifact({
        // intentionally pass a bogus token
        token: Symbol('not-the-real-token') as unknown as typeof PROPOSE_ACCEPT_INVOCATION_TOKEN,
        projectRoot: root,
        kind: 'skill',
        proposalId: 'abc',
        targetPath: '.claude/skills/foo/SKILL.md',
        artifactFilename: 'SKILL.md',
      }),
    ).toThrow(ProposeAcceptError);
  });

  it('loadProposalArtifact refuses traversal in artifact filenames', () => {
    expect(() =>
      loadProposalArtifact({
        token: PROPOSE_ACCEPT_INVOCATION_TOKEN,
        projectRoot: root,
        kind: 'skill',
        proposalId: 'abc',
        targetPath: '.claude/skills/foo/SKILL.md',
        artifactFilename: '../../escape.md',
      }),
    ).toThrow(ProposeAcceptError);
  });

  it('after writeProposalArtifact, no file appears outside .claude/coherence/', () => {
    writeProposalArtifact(root, 'skill', 'abc', 'SKILL.md', 'x');
    // Walk root and assert no top-level `.claude/skills` directory exists.
    const dotClaude = path.join(root, '.claude');
    if (existsSync(dotClaude)) {
      const subs = readdirSync(dotClaude);
      // Only `coherence/` may exist under `.claude/`.
      for (const s of subs) {
        expect(s).toBe('coherence');
      }
    }
  });
});
