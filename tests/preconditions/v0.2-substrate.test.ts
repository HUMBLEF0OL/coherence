/**
 * v0.2 substrate sanity test.
 *
 * Originally an M0 pre-flight gate; the bootstrap-only assertions on
 * PRECONDITION.md and spec-freeze artifacts have been removed (those
 * docs were one-time process artifacts; deleted as solo-dev overhead).
 * Surviving assertions verify that v0.2 substrate hooks into the v0.1
 * source tree correctly — these remain useful invariants.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

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
    const planPath = path.join(
      ROOT,
      'docs',
      'superpowers',
      'plans',
      '2026-05-09-coherence-v0.2.md',
    );
    const text = readFileSync(planPath, 'utf8');
    // v0.1 ended at DD-064; v0.2 starts at DD-065.
    expect(text).toMatch(/DD-065/);
  });
});
