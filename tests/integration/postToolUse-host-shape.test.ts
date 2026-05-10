/**
 * P13 fix coverage: postToolUseHook fires DD-068 + bash-repetition
 * detector when the host emits the documented shape
 * `{tool_name: 'Bash', tool_input: {command}}`. This guards against
 * the regression where v0.2 wiring used flat field names that don't
 * exist on real Claude Code events.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { postToolUseHook } from '../../src/hooks/postToolUse.js';
import { initCoherenceDir } from '../../src/state/init.js';

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-pt-shape-'));
  await initCoherenceDir(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function readMetrics(): unknown[] {
  const p = path.join(dir, '.claude', 'coherence', 'metrics.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

describe('P13: postToolUse handles documented host event shape', () => {
  it('emits tool_invocation_signature + proposal_signal_observed for tool_name=Bash', async () => {
    await postToolUseHook(
      {
        tool_name: 'Bash',
        tool_input: { command: 'ls -la' },
        session_id: 'sess-A',
      },
      dir,
    );
    const events = readMetrics() as Array<{ event: string; signal_kind?: string }>;
    expect(events.find((e) => e.event === 'tool_invocation_signature')).toBeDefined();
    const obs = events.find(
      (e) => e.event === 'proposal_signal_observed' && e.signal_kind === 'bash_repetition',
    );
    expect(obs).toBeDefined();
  });

  it('legacy flat shape still works (back-compat)', async () => {
    await postToolUseHook(
      { tool: 'Bash', command: 'echo hi', session_id: 'sess-B' },
      dir,
    );
    const events = readMetrics() as Array<{ event: string; signal_kind?: string }>;
    expect(events.find((e) => e.event === 'tool_invocation_signature')).toBeDefined();
    expect(
      events.find(
        (e) =>
          e.event === 'proposal_signal_observed' &&
          e.signal_kind === 'bash_repetition',
      ),
    ).toBeDefined();
  });

  it('emits proposal_signal_observed for file_creation on Edit/Write shape', async () => {
    const f1 = path.join(dir, 'a.md');
    const f2 = path.join(dir, 'b.md');
    const { writeFileSync } = await import('fs');
    writeFileSync(f1, '# A\n\nhi');
    writeFileSync(f2, '# B\n\nhi');
    await postToolUseHook(
      {
        tool_name: 'Write',
        tool_input: { file_path: f1 },
        session_id: 's',
      },
      dir,
    );
    await postToolUseHook(
      {
        tool_name: 'Write',
        tool_input: { file_path: f2 },
        session_id: 's',
      },
      dir,
    );
    const events = readMetrics() as Array<{
      event: string;
      signal_kind?: string;
      occurrences_in_locality?: number;
    }>;
    const fileEvents = events.filter(
      (e) => e.event === 'proposal_signal_observed' && e.signal_kind === 'file_creation',
    );
    expect(fileEvents.length).toBeGreaterThanOrEqual(2);
  });
});
