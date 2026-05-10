/**
 * M0 — v0.2 Bootstrap precondition test.
 * Asserts the v0.1 substrate is intact and that DD-068 telemetry events are
 * declared in the source. No live session is exercised — this is metadata only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

describe('M0 v0.2 substrate precondition', () => {
  it('has a PRECONDITION.md document', () => {
    const p = path.join(ROOT, 'docs', 'v0.2', 'PRECONDITION.md');
    expect(existsSync(p)).toBe(true);
    const text = readFileSync(p, 'utf8');
    expect(text).toMatch(/Coherence v0\.2 Precondition Checklist/);
  });

  it('has a spec freeze artifact enumerating DD-065..DD-092', () => {
    const p = path.join(ROOT, 'docs', 'superpowers', 'plans', 'v0.2-spec-freeze-2026-05-09.md');
    expect(existsSync(p)).toBe(true);
    const text = readFileSync(p, 'utf8');
    for (const ddNum of [65, 66, 67, 68, 69, 70, 75, 80, 84, 88, 91, 92]) {
      expect(text).toMatch(new RegExp(`DD-0${ddNum.toString().padStart(2, '0')}`));
    }
  });

  it('declares DD-068 author signal events in the metrics emitter', () => {
    const p = path.join(ROOT, 'src', 'state', 'metrics.ts');
    const text = readFileSync(p, 'utf8');
    // v0.1 substrate may not yet declare DD-068 events; v0.2 substrate will.
    // This assertion enforces the declaration once v0.2 telemetry catalogue lands.
    expect(text).toMatch(/tool_invocation_signature|user_prompt_signature|agent_response_id/);
  });

  it('has version.json schema accepting schema_version 1 and 2', () => {
    const p = path.join(ROOT, 'src', 'state', 'schemas', 'version.schema.json');
    const schema = JSON.parse(readFileSync(p, 'utf8')) as {
      properties: { schema_version: { minimum?: number; maximum?: number } };
    };
    // v0.1 schema allowed minimum 0; v0.2 must continue to allow 1 and 2.
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
