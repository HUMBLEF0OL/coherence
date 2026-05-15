/**
 * Generic CLI dispatcher contract tests (v1.1.0 Phase 2 — closes the M4
 * body-pattern gap).
 *
 * Each slash command's body in `commands/<name>.md` invokes
 * `node dist/cli.js <name> [args...]`. These tests verify that
 * `runCli(argv)` routes correctly for the four wired commands
 * (feedback, propose, plan, statusline).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../../src/cli.js';
import { runFreshInstall } from '../../src/state/firstRun.js';

describe('runCli', () => {
  let tmp: string;
  let origCwd: string;

  beforeEach(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), 'coherence-cli-'));
    origCwd = process.cwd();
    process.chdir(tmp);
    await runFreshInstall(tmp, { silent: true });
  });
  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('feedback: prints a JSON bundle with pluginVersion + mode + recentActivity', async () => {
    const out = await runCli(['feedback', 'auto-apply', 'gate', 'misfired']);
    const bundle = JSON.parse(out);
    expect(bundle.pluginVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof bundle.mode).toBe('string');
    expect(Array.isArray(bundle.recentActivity)).toBe(true);
    expect(bundle.userMessage).toBe('auto-apply gate misfired');
  });

  it('propose (bare): prints help text', async () => {
    const out = await runCli(['propose']);
    expect(out).toContain('/coherence:propose <subcommand>');
    expect(out).toContain('accept');
    expect(out).toContain('list');
  });

  it('propose list: renders the (empty) proposal list', async () => {
    const out = await runCli(['propose', 'list']);
    expect(out).toContain('[coherence] proposals:');
    expect(out).toContain('(none)');
  });

  it('plan (bare): prints help text', async () => {
    const out = await runCli(['plan']);
    expect(out).toContain('/coherence:plan <subcommand>');
    expect(out).toContain('create');
    expect(out).toContain('accept');
    expect(out).toContain('reject');
  });

  it('plan create: missing args → usage error pointing at the new surface', async () => {
    await expect(runCli(['plan', 'create'])).rejects.toThrow(
      /\/coherence:plan create/,
    );
  });

  it('statusline (bare): prints help text', async () => {
    const out = await runCli(['statusline']);
    expect(out).toContain('/coherence:statusline <subcommand>');
    expect(out).toContain('install');
    expect(out).toContain('uninstall');
  });

  it('propose: unknown subcommand surfaces a clear error', async () => {
    await expect(runCli(['propose', 'frobnicate'])).rejects.toThrow(
      /unknown subcommand: frobnicate/i,
    );
  });

  it('top-level: unknown command rejects with a clear message', async () => {
    await expect(runCli(['definitely-not-a-command'])).rejects.toThrow(
      /Unknown command: definitely-not-a-command/,
    );
  });

  it('no args: prints usage hint instead of crashing', async () => {
    const out = await runCli([]);
    expect(out).toContain('Usage: node dist/cli.js');
  });
});
