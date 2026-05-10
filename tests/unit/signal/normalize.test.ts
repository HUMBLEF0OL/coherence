/**
 * Bash + path normalisation (FR-OBS-N1a, N1b, N1c, N1d).
 */
import { describe, it, expect } from 'vitest';
import {
  normaliseBashCommand,
  normaliseFilePath,
  lengthBucket,
  refersToPrior,
  LENGTH_BUCKETS,
} from '../../../src/signal/normalize.js';

describe('normaliseBashCommand', () => {
  it('collapses whitespace', () => {
    expect(normaliseBashCommand('ls   -la')).toBe(normaliseBashCommand('ls -la'));
  });

  it('strips leading cd … &&', () => {
    expect(normaliseBashCommand('cd /tmp && ls -la')).toBe(normaliseBashCommand('ls -la'));
  });

  it('strips leading env-var assignments', () => {
    expect(normaliseBashCommand('FOO=bar BAR=baz npm test')).toBe(normaliseBashCommand('npm test'));
  });

  it('replaces UUIDs and timestamps', () => {
    const u = '11111111-2222-3333-4444-555555555555';
    expect(normaliseBashCommand(`echo ${u}`)).toContain('<UUID>');
    expect(normaliseBashCommand('echo 2026-05-10')).toContain('<TS>');
  });
});

describe('normaliseFilePath', () => {
  it('replaces UUIDs in paths', () => {
    const p = 'tests/11111111-2222-3333-4444-555555555555/foo.test.ts';
    expect(normaliseFilePath(p)).toContain('<UUID>');
  });
  it('forward-slashes win over backslashes', () => {
    expect(normaliseFilePath('a\\b\\c')).toBe('a/b/c');
  });
});

describe('lengthBucket', () => {
  it('tiny prompt → bucket 0', () => {
    expect(lengthBucket(10)).toBe(0);
  });
  it('returns max bucket for huge inputs', () => {
    expect(lengthBucket(1_000_000)).toBe(LENGTH_BUCKETS.length);
  });
});

describe('refersToPrior', () => {
  it('matches obvious correction phrasings', () => {
    expect(refersToPrior('no, not that')).toBe(true);
    expect(refersToPrior("that's wrong")).toBe(true);
    expect(refersToPrior('actually use sqrt instead')).toBe(true);
  });
  it('does not match neutral prompts', () => {
    expect(refersToPrior('write a binary search')).toBe(false);
    expect(refersToPrior('add a docstring')).toBe(false);
  });
});
