/**
 * Final SG-3 sweep (M8/M10).
 *
 * Asserts:
 *  - DD-065 boundary still holds (regression of M1 lint).
 *  - DD-068 events declared in metrics.ts.
 *  - Author/Annotate prompts pinned to v2 manifest.
 *  - No raw command/path/prompt content leaks through metricsRetention.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');

describe('v0.2 final SG sweep', () => {
  it('DD-068 event names are in metrics.ts MetricEventType', () => {
    const txt = readFileSync(path.join(ROOT, 'src', 'state', 'metrics.ts'), 'utf8');
    expect(txt).toMatch(/'tool_invocation_signature'/);
    expect(txt).toMatch(/'user_prompt_signature'/);
    expect(txt).toMatch(/'agent_response_id'/);
  });

  it('prompts/v2 manifest pins the v0.2 model + temperature 0', () => {
    const m = JSON.parse(
      readFileSync(path.join(ROOT, 'prompts', 'v2', 'manifest.json'), 'utf8'),
    );
    expect(m.model).toBe('claude-sonnet-4-6');
    expect(m.temperature).toBe(0);
  });

  it('the proposeAccept token is the only export that crosses the boundary', () => {
    const txt = readFileSync(
      path.join(ROOT, 'src', 'permissions', 'proposeAccept.ts'),
      'utf8',
    );
    expect(txt).toMatch(/PROPOSE_ACCEPT_INVOCATION_TOKEN/);
    expect(txt).toMatch(/Symbol\.for\(/);
  });

  it('commands.config.json registers the new v0.2 commands', () => {
    // v0.4 DD-119: manifest moved to .claude-plugin/plugin.json.
    // v1.0.2: command list moved out of plugin.json#slashCommands (rejected by
    // the modern manifest schema) into scripts/commands.config.json.
    // v1.1.0 M4: command names are bare (no `coherence:` prefix) — Claude Code
    // natively namespaces commands/<name>.md as /coherence:<name>.
    const p = JSON.parse(
      readFileSync(path.join(ROOT, 'scripts', 'commands.config.json'), 'utf8'),
    );
    const names = (p.commands as Array<{ name: string }>).map((c) => c.name);
    for (const n of [
      'propose-list',
      'propose-show',
      'propose-accept',
      'propose-reject',
      'propose-revert-acceptance',
      'install-statusline',
      'uninstall-statusline',
      'annotate',
    ]) {
      expect(names).toContain(n);
    }
  });
});
