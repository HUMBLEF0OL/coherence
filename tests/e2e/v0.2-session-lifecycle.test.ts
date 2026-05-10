/**
 * v0.2 full session lifecycle (e2e).
 *
 * Drives a synthetic Claude Code session through:
 *   SessionStart → 3× UserPromptSubmit → 3× PostToolUse(Bash) → Stop → SessionEnd
 *
 * with realistic event shapes (the documented `tool_name + tool_input`
 * form). Asserts:
 *   - DD-068 telemetry events fire (tool_invocation_signature,
 *     user_prompt_signature).
 *   - bash_repetition signal observation lands and `would_have_fired=true`
 *     on the third repeat.
 *   - the post-Stop Author tail enqueues a proposal.
 *   - state-snapshot.json reflects the queued proposal at SessionEnd.
 *   - SG-3 boundary holds: nothing written outside .claude/coherence/
 *     except the proposal artifact under quarantine.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { sessionStartHook } from '../../src/hooks/sessionStart.js';
import { userPromptSubmitHook } from '../../src/hooks/userPromptSubmit.js';
import { postToolUseHook } from '../../src/hooks/postToolUse.js';
import { stopHook } from '../../src/hooks/stop.js';
import { sessionEndHook } from '../../src/hooks/sessionEnd.js';
import { runProposeAccept } from '../../src/commands/proposeAccept.js';
import { runProposeList } from '../../src/commands/proposeList.js';
import { makeStateStore } from '../../src/state/init.js';
import { ProposalStore } from '../../src/proposals/store.js';
import { resetFileLocalityCache } from '../../src/signal/fileLocalityCache.js';
import { reset as resetSnapshotWriter } from '../../src/state/snapshotWriter.js';

let dir: string;
const SESSION_ID = 'session-e2e-lifecycle';

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-e2e-life-'));
  ProposalStore.resetSessionCount(SESSION_ID);
  resetFileLocalityCache();
  resetSnapshotWriter();
  // Force the mock Author transport so we don't hit the real API.
  process.env['COHERENCE_AUTHOR_MOCK'] = '1';
});

afterEach(() => {
  delete process.env['COHERENCE_AUTHOR_MOCK'];
  rmSync(dir, { recursive: true, force: true });
});

function readMetrics(): Array<Record<string, unknown>> {
  const p = path.join(dir, '.claude', 'coherence', 'metrics.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('v0.2 full session lifecycle', () => {
  it('produces a complete proposal lifecycle end-to-end', async () => {
    // 1. SessionStart
    const ss = await sessionStartHook({ session_id: SESSION_ID }, dir);
    expect(ss.success).toBe(true);
    expect(existsSync(path.join(dir, '.claude', 'coherence', 'graduation.json'))).toBe(true);

    // 2. Three user prompts (DD-068 user_prompt_signature should fire each).
    for (const prompt of ['build first', 'build again', 'one more time']) {
      await userPromptSubmitHook({ prompt, session_id: SESSION_ID }, dir);
    }

    // 3. Three identical bash invocations (documented host shape).
    for (let i = 0; i < 3; i++) {
      const r = await postToolUseHook(
        {
          tool_name: 'Bash',
          tool_input: { command: 'npm run build' },
          session_id: SESSION_ID,
        },
        dir,
      );
      expect(r.success).toBe(true);
    }

    // 4. Stop hook — Author tail should fire for the bash signal.
    const stopResult = await stopHook({ session_id: SESSION_ID }, dir);
    expect(stopResult.success).toBe(true);

    // 5. SessionEnd
    await sessionEndHook({ session_id: SESSION_ID }, dir);

    // ----- Assertions -----
    const events = readMetrics();
    const promptSigs = events.filter((e) => e.event === 'user_prompt_signature');
    expect(promptSigs.length).toBe(3);

    const toolSigs = events.filter((e) => e.event === 'tool_invocation_signature');
    expect(toolSigs.length).toBe(3);

    const obs = events.filter(
      (e) => e.event === 'proposal_signal_observed' && e.signal_kind === 'bash_repetition',
    );
    expect(obs.length).toBe(3);
    expect(obs[2].would_have_fired).toBe(true);

    const proposed = events.filter((e) => e.event === 'proposal_proposed');
    expect(proposed.length).toBeGreaterThanOrEqual(1);
    expect(proposed[0].kind).toBe('slash_command');
    const proposalId = proposed[0].proposal_id as string;
    expect(proposalId).toMatch(/^[0-9a-f]{32}$/);

    // 6. SG-3 boundary check: only .claude/coherence/ exists under .claude/.
    const dotClaude = path.join(dir, '.claude');
    if (existsSync(dotClaude)) {
      const subs = readdirSync(dotClaude);
      for (const s of subs) {
        expect(s).toBe('coherence');
      }
    }

    // 7. R10: the materialised quarantine artifact + manifest exist on disk.
    const proposalDir = path.join(
      dir,
      '.claude',
      'coherence',
      'proposals',
      'slash_command',
      proposalId,
    );
    expect(existsSync(proposalDir)).toBe(true);
    const manifestPath = path.join(proposalDir, 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.proposal_id).toBe(proposalId);
    expect(manifest.kind).toBe('slash_command');
    expect(manifest.state).toBe('queued');
    // The artifact body file (kebab-name).md or similar must exist alongside.
    // S3: ≥ 1 (not exactly 1) so a future Author pipeline that emits a
    // sidecar / multi-file proposal isn't blocked by this test.
    const artifactFiles = readdirSync(proposalDir).filter((f) => f !== 'manifest.json');
    expect(artifactFiles.length).toBeGreaterThanOrEqual(1);
    const body = readFileSync(path.join(proposalDir, artifactFiles[0]), 'utf8');
    expect(body.length).toBeGreaterThan(0);

    // 8. The state-snapshot reflects queued proposals.
    const snapshot = JSON.parse(
      readFileSync(path.join(dir, '.claude', 'coherence', 'state-snapshot.json'), 'utf8'),
    );
    expect(snapshot.proposal_counts.queued).toBeGreaterThanOrEqual(1);

    // 9. T2: propose-list surfaces the proposal; propose-accept lands the
    // markdown at .claude/commands/<name>.md AND the rendered output
    // contains the slash_command documentation-only warning.
    const store2 = makeStateStore(dir);
    await runProposeList(store2, { sessionId: SESSION_ID });
    const accept = await runProposeAccept({
      store: store2,
      projectRoot: dir,
      proposalId,
      sessionId: SESSION_ID,
    });
    expect(accept.accepted).toBe(true);
    expect(accept.rendered).toContain('DOCUMENTATION ONLY');
    expect(existsSync(accept.written_path!)).toBe(true);
    // plugin.json untouched (N5 documentation-only delivery).
    // (Lifecycle test created project tree fresh; plugin.json doesn't exist.)
  });
});
