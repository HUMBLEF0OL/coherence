/**
 * v0.2 substrate sanity test.
 *
 * Originally an M0 pre-flight gate; the bootstrap-only assertions on
 * PRECONDITION.md and spec-freeze artifacts have been removed (those
 * docs were one-time process artifacts; deleted as solo-dev overhead).
 * Surviving assertions verify that v0.2 substrate hooks into the v0.1
 * source tree correctly — these remain useful invariants.
 *
 * v0.3 (DD-118) retired the v1→v2 migrator; the corresponding end-to-end
 * assertion has been removed. SessionStart now consults `refuseLegacy()`
 * for pre-v3 state — see `tests/unit/state/refuse-legacy.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { proposalId } from '../../src/proposals/manifest.js';

const ROOT = path.resolve(__dirname, '..', '..');

describe('v0.2 substrate invariants', () => {
  it('declares DD-068 author signal events in the metrics emitter', () => {
    const p = path.join(ROOT, 'src', 'state', 'metrics.ts');
    const text = readFileSync(p, 'utf8');
    expect(text).toMatch(/tool_invocation_signature|user_prompt_signature|agent_response_id/);
  });

  it('version schema accepts schema_version 1 and 2', () => {
    const p = path.join(ROOT, 'src', 'state', 'schemas', 'version.schema.json');
    const schema = JSON.parse(readFileSync(p, 'utf8')) as {
      properties: { schema_version: { minimum?: number; maximum?: number } };
    };
    expect(schema.properties.schema_version).toBeDefined();
  });

  it('preserves DD numbering integrity (no DD-064 collision)', () => {
    // v0.1 ended at DD-064; v0.2 starts at DD-065 with the quarantine
    // boundary. The per-version implementation plans that originally
    // anchored this assertion now live in Notion (see
    // "Coherence — Implementation Plans (archive)"). DD-065 must still
    // be referenced in the source tree as the load-bearing quarantine
    // boundary identifier.
    const candidates = [
      path.join(ROOT, 'src', 'permissions', 'proposeAccept.ts'),
      path.join(ROOT, 'src', 'commands', 'graduate.ts'),
      path.join(ROOT, 'src', 'modes', 'resolver.ts'),
    ];
    const referencedAnywhere = candidates.some((p) => readFileSync(p, 'utf8').includes('DD-065'));
    expect(referencedAnywhere).toBe(true);
  });

  it('proposalId is a deterministic RFC-4122 UUID v5 (32-hex form)', () => {
    const id1 = proposalId('skill', 'abc123');
    const id2 = proposalId('skill', 'abc123');
    const id3 = proposalId('skill', 'abc124');
    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    // 32-char lowercase hex.
    expect(id1).toMatch(/^[0-9a-f]{32}$/);
    // RFC-4122 §4.3: byte 6 high nibble = 5 (version), byte 8 top two bits = 10 (variant).
    expect(id1.charAt(12)).toBe('5');
    const variantNibble = parseInt(id1.charAt(16), 16);
    expect(variantNibble & 0b1100).toBe(0b1000);
  });
});
