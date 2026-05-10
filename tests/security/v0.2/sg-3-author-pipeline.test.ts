/**
 * SG-3: adversarial Author payload returns a malicious shape →
 * proposalValidator rejects, no FS effect outside quarantine.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { ProposalStore } from '../../../src/proposals/store.js';
import { runAuthorPipeline } from '../../../src/llm/authorPipeline.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-sg3-author-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SG-3 author pipeline: adversarial payloads', () => {
  it('refuses an Author response that injects a path traversal in body', async () => {
    const transport = async () =>
      JSON.stringify({
        name: 'evil',
        description: 'evil',
        body_md: '../../etc/passwd',
      });
    const out = await runAuthorPipeline(
      { signal_kind: 'file_creation', signal_hash: 'x', signal_evidence: {} },
      transport,
    );
    expect(out.status).toBe('invalid');
  });

  it('SG-3: even a valid payload writes only inside .claude/coherence/proposals/', async () => {
    const coherenceDir = path.join(dir, '.claude', 'coherence');
    const store = new StateStore(coherenceDir, path.join(coherenceDir, 'quarantine'));
    const pstore = new ProposalStore(store);
    await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'goodhash',
      artifact: { filename: 'SKILL.md', content: '# hi' },
      sessionId: 's1',
    });
    // Outside .claude/coherence, no skill files appear.
    expect(existsSync(path.join(dir, '.claude', 'skills'))).toBe(false);
    expect(existsSync(path.join(dir, '.claude', 'agents'))).toBe(false);
    expect(existsSync(path.join(dir, '.claude', 'commands'))).toBe(false);
    const dotClaude = readdirSync(path.join(dir, '.claude'));
    for (const sub of dotClaude) {
      expect(sub).toBe('coherence');
    }
  });
});
