/**
 * D6 fix coverage: client.ts loads prompts/v2 manifest + serves the
 * v0.2 LlmStage values. liveAuthorTransport calls llmCall with the right
 * stage and prompt.
 */
import { describe, it, expect } from 'vitest';
import { loadManifestV2, loadV2Prompt, _resetManifestCache } from '../../../src/llm/client.js';

describe('D6 prompts/v2 manifest', () => {
  it('loadManifestV2 pins claude-sonnet-4-6 + temperature 0', () => {
    _resetManifestCache();
    const m = loadManifestV2();
    expect(m.model).toBe('claude-sonnet-4-6');
    expect(m.temperature).toBe(0);
    expect(m.author_version).toBe('v2.0');
    expect(m.annotate_version).toBe('v2.0');
  });

  it('loadV2Prompt returns the body of a prompt by manifest key', () => {
    const skill = loadV2Prompt('author/skill.md');
    expect(skill).toContain('Author proposer');
    expect(skill).toContain('NO_PROPOSAL');

    const annotate = loadV2Prompt('annotate/anchor.md');
    expect(annotate).toContain('Annotate proposer');
  });

  it('manifest cache returns identical references on repeated calls', () => {
    _resetManifestCache();
    const a = loadManifestV2();
    const b = loadManifestV2();
    expect(a).toBe(b); // same cached object
  });
});

describe('D6 author pipeline live transport (P12 expanded coverage)', () => {
  it('v0.2 prompts contain the kind-specific Author proposer headers', () => {
    expect(loadV2Prompt('author/skill.md')).toContain('Author proposer — Skill');
    expect(loadV2Prompt('author/slash-command.md')).toContain(
      'Author proposer — Slash command',
    );
    expect(loadV2Prompt('author/agent.md')).toContain('Author proposer — Agent');
  });

  it('liveAuthorTransport replays a cassette when one exists', async () => {
    // Drop a cassette file directly. The cassette id is
    // `author/<signal_kind>/<signal_hash>`.
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('fs');
    const { tmpdir } = await import('os');
    const pathMod = await import('path');
    const path = pathMod.default;
    const cassetteDir = mkdtempSync(path.join(tmpdir(), 'coherence-cassettes-'));
    const prevEnv = process.env['COHERENCE_CASSETTES_DIR'];
    process.env['COHERENCE_CASSETTES_DIR'] = cassetteDir;
    try {
      const cassetteId = 'author/bash_repetition/test-hash';
      const cassettePath = path.join(cassetteDir, `${cassetteId}.json`);
      mkdirSync(path.dirname(cassettePath), { recursive: true });
      writeFileSync(
        cassettePath,
        JSON.stringify({
          content: '{"name":"x-foo","description":"yz"}',
          input_tokens: 10,
          output_tokens: 5,
          cost_usd: 0,
          timestamp: '2026-05-10T00:00:00Z',
        }),
      );
      const { liveAuthorTransport } = await import('../../../src/llm/authorPipeline.js');
      const out = await liveAuthorTransport(
        {
          signal_kind: 'bash_repetition',
          signal_hash: 'test-hash',
          signal_evidence: {},
        },
        'author/slash-command.md',
      );
      expect(out).toBe('{"name":"x-foo","description":"yz"}');
    } finally {
      if (prevEnv === undefined) delete process.env['COHERENCE_CASSETTES_DIR'];
      else process.env['COHERENCE_CASSETTES_DIR'] = prevEnv;
      rmSync(cassetteDir, { recursive: true, force: true });
    }
  });
});
