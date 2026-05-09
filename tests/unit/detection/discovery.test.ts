/**
 * File discovery tests — FR-DETECT-13, DD-040
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { discoverFiles } from '../../../src/detection/discovery.js';

const SMALL_ROOT = path.resolve('tests/fixtures/codebases/small');

describe('discoverFiles', () => {
  it('discovers skills at .claude/skills/*/SKILL.md', () => {
    const files = discoverFiles(SMALL_ROOT);
    const skills = files.filter((f) => f.type === 'skill');
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.every((f) => f.path.endsWith('SKILL.md'))).toBe(true);
  });

  it('discovers agents at .claude/agents/*.md', () => {
    const files = discoverFiles(SMALL_ROOT);
    const agents = files.filter((f) => f.type === 'agent');
    expect(agents.length).toBeGreaterThan(0);
  });

  it('discovers CLAUDE.md at project root', () => {
    const files = discoverFiles(SMALL_ROOT);
    const docs = files.filter((f) => f.type === 'doc');
    expect(docs.some((f) => f.path.endsWith('CLAUDE.md'))).toBe(true);
  });

  it('does not include .env files', () => {
    const files = discoverFiles(SMALL_ROOT);
    expect(files.every((f) => !f.path.endsWith('.env'))).toBe(true);
  });
});
