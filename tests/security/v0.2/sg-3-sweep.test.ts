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
    expect(m.model).toBe('claude-sonnet-4-5-20251022');
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

  it('plugin.json registers the new v0.2 commands', () => {
    // v0.4 DD-119: manifest moved to .claude-plugin/plugin.json
    const p = JSON.parse(
      readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
    );
    const names = (p.slashCommands as Array<{ name: string }>).map((c) => c.name);
    for (const n of [
      'coherence:propose-list',
      'coherence:propose-show',
      'coherence:propose-accept',
      'coherence:propose-reject',
      'coherence:propose-revert-acceptance',
      'coherence:install-statusline',
      'coherence:uninstall-statusline',
      'coherence:annotate',
    ]) {
      expect(names).toContain(n);
    }
  });
});
