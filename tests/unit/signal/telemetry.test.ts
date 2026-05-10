/**
 * P14 fix coverage: emitAgentResponseId produces a digest that varies
 * with responseLines (and agentId), so prior_response_id correlation
 * is meaningful. P3 fix: Stop hook only emits when responseLines > 0.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import {
  emitAgentResponseId,
  emitUserPromptSignature,
  clearResponseCorrelation,
  _peekCorrelation,
} from '../../../src/signal/telemetry.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-tel-'));
  const c = path.join(dir, '.claude', 'coherence');
  store = new StateStore(c, path.join(c, 'quarantine'));
  clearResponseCorrelation();
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

describe('P14: agent_response_id varies meaningfully', () => {
  it('different responseLines → different response_id', async () => {
    await emitAgentResponseId(store, 's', { agentId: 'agent-A', responseLines: 10 });
    await emitAgentResponseId(store, 's', { agentId: 'agent-A', responseLines: 25 });
    const evs = readMetrics() as Array<{ event: string; response_id?: string }>;
    const responses = evs.filter((e) => e.event === 'agent_response_id');
    expect(responses.length).toBe(2);
    expect(responses[0].response_id).not.toBe(responses[1].response_id);
  });

  it('different agentId → different response_id', async () => {
    await emitAgentResponseId(store, 's', { agentId: 'agent-A', responseLines: 10 });
    await emitAgentResponseId(store, 's', { agentId: 'agent-B', responseLines: 10 });
    const evs = readMetrics() as Array<{ event: string; response_id?: string }>;
    const responses = evs.filter((e) => e.event === 'agent_response_id');
    expect(responses[0].response_id).not.toBe(responses[1].response_id);
  });

  it('correlation cache: prior_response_id reflects the last agent_response_id', async () => {
    expect(_peekCorrelation()).toBeNull();
    await emitAgentResponseId(store, 's', { agentId: 'a', responseLines: 7 });
    const id = _peekCorrelation();
    expect(id).not.toBeNull();
    // Subsequent user_prompt_signature carries this prior id.
    await emitUserPromptSignature(store, 's', { prompt: 'thanks' });
    const evs = readMetrics() as Array<{
      event: string;
      prior_response_id?: string | null;
    }>;
    const prompt = evs.find((e) => e.event === 'user_prompt_signature');
    expect(prompt?.prior_response_id).toBe(id);
  });

  it('clearResponseCorrelation resets the cache', async () => {
    await emitAgentResponseId(store, 's', { agentId: 'a', responseLines: 7 });
    expect(_peekCorrelation()).not.toBeNull();
    clearResponseCorrelation();
    expect(_peekCorrelation()).toBeNull();
  });
});
