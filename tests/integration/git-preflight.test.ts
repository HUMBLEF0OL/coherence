/**
 * Git pre-flight tests.
 * R-8 closure — every pre-flight branch tested.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { preflight } from '../../src/git/adapter.js';

let tmpDir: string;

function initGitRepo(dir: string): void {
  execFileSync('git', ['init', '--initial-branch=main', dir], { stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'pipe' });
  writeFileSync(path.join(dir, 'README.md'), '# Test\n');
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['commit', '--no-gpg-sign', '-m', 'init'], { cwd: dir, stdio: 'pipe' });
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-git-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('git preflight (R-8)', () => {
  it('returns ok for clean repo', () => {
    initGitRepo(tmpDir);
    const result = preflight(tmpDir);
    expect(result.ok).toBe(true);
  });

  it('rejects when MERGE_HEAD present', () => {
    initGitRepo(tmpDir);
    writeFileSync(path.join(tmpDir, '.git', 'MERGE_HEAD'), 'abc123\n');
    const result = preflight(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/merge/i);
    }
  });

  it('rejects when CHERRY_PICK_HEAD present', () => {
    initGitRepo(tmpDir);
    writeFileSync(path.join(tmpDir, '.git', 'CHERRY_PICK_HEAD'), 'abc123\n');
    const result = preflight(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/cherry-pick/i);
    }
  });

  it('rejects when REBASE_HEAD present', () => {
    initGitRepo(tmpDir);
    writeFileSync(path.join(tmpDir, '.git', 'REBASE_HEAD'), 'abc123\n');
    const result = preflight(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/rebase/i);
    }
  });

  it('rejects when rebase-merge dir present', () => {
    initGitRepo(tmpDir);
    mkdirSync(path.join(tmpDir, '.git', 'rebase-merge'));
    const result = preflight(tmpDir);
    expect(result.ok).toBe(false);
  });
});
