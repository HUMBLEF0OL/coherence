/**
 * v0.2 schema round-trip tests (M2).
 */
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const ajv = addFormats(new Ajv({ allErrors: true })) as Ajv;

const SCHEMA_DIR = path.resolve('src/state/schemas');

function loadSchema(name: string): object {
  return JSON.parse(readFileSync(path.join(SCHEMA_DIR, name), 'utf8')) as object;
}

describe('graduation.schema.json', () => {
  const schema = loadSchema('graduation.schema.json');

  it('accepts a default v2 graduation file', () => {
    const data = { schema_version: 2, global_mode: 'observe', scopes: [] };
    expect(ajv.validate(schema, data)).toBe(true);
  });

  it('accepts per-doc + per-dir overrides', () => {
    const data = {
      schema_version: 2,
      global_mode: 'observe',
      scopes: [
        { path: 'docs/', mode: 'annotate' },
        { path: 'docs/api.md', mode: 'author' },
      ],
    };
    expect(ajv.validate(schema, data)).toBe(true);
  });

  it('rejects unknown modes', () => {
    const data = { schema_version: 2, global_mode: 'banana', scopes: [] };
    expect(ajv.validate(schema, data)).toBe(false);
  });
});

describe('proposal-cache.schema.json', () => {
  const schema = loadSchema('proposal-cache.schema.json');

  it('accepts an empty cache', () => {
    expect(ajv.validate(schema, { schema_version: 2, entries: [] })).toBe(true);
  });

  it('accepts a queued proposal entry', () => {
    const data = {
      schema_version: 2,
      entries: [
        {
          proposal_id: 'a'.repeat(32),
          kind: 'skill',
          signal_hash: 'abcdef123456',
          state: 'queued',
          generated_at: '2026-05-10T00:00:00.000Z',
          expires_at: '2026-05-24T00:00:00.000Z',
          consecutive_ignored: 0,
          state_history: [{ state: 'queued', at: '2026-05-10T00:00:00.000Z' }],
        },
      ],
    };
    expect(ajv.validate(schema, data)).toBe(true);
  });

  it('rejects a non-32-hex proposal_id', () => {
    const data = {
      schema_version: 2,
      entries: [
        {
          proposal_id: 'NOTHEX',
          kind: 'skill',
          signal_hash: 'x',
          state: 'queued',
          generated_at: '2026-05-10T00:00:00.000Z',
          expires_at: '2026-05-24T00:00:00.000Z',
          consecutive_ignored: 0,
          state_history: [],
        },
      ],
    };
    expect(ajv.validate(schema, data)).toBe(false);
  });
});

describe('signal-cache.schema.json', () => {
  const schema = loadSchema('signal-cache.schema.json');

  it('accepts an empty signal cache with the three buckets', () => {
    const data = {
      schema_version: 2,
      buckets: {
        bash_repetition: { maxItems: 500, items: [] },
        file_creation: { maxItems: 500, items: [] },
        agent_correction: { maxItems: 200, items: [] },
      },
    };
    expect(ajv.validate(schema, data)).toBe(true);
  });

  it('rejects a wrong maxItems for a bucket', () => {
    const data = {
      schema_version: 2,
      buckets: {
        bash_repetition: { maxItems: 100, items: [] },
        file_creation: { maxItems: 500, items: [] },
        agent_correction: { maxItems: 200, items: [] },
      },
    };
    expect(ajv.validate(schema, data)).toBe(false);
  });
});

describe('state-snapshot.schema.json', () => {
  const schema = loadSchema('state-snapshot.schema.json');

  it('accepts a default snapshot', () => {
    const data = {
      schema_version: 2,
      written_at: '2026-05-10T00:00:00.000Z',
      buffer_count: 0,
      proposal_counts: { queued: 0, surfaced: 0, ignored: 0 },
      mode: 'observe',
      degraded: false,
    };
    expect(ajv.validate(schema, data)).toBe(true);
  });
});

describe('drift-buffer.schema.json widening', () => {
  const schema = loadSchema('drift-buffer.schema.json');

  it('accepts the widened source enum (signal_bash, trickle_deep_scan)', () => {
    const data = {
      state: 'pending',
      entries: [
        {
          path: '/tmp/foo.md',
          sectionRef: '/tmp/foo.md#bar',
          contentHash:
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          triggeredAt: '2026-05-10T00:00:00.000Z',
          source: 'trickle_deep_scan',
        },
      ],
    };
    expect(ajv.validate(schema, data)).toBe(true);
  });
});

describe('cost-ledger.schema.json widening', () => {
  const schema = loadSchema('cost-ledger.schema.json');

  it('accepts the widened stage enum (author, annotate)', () => {
    const data = {
      session_id: 's',
      entries: [
        {
          session_id: 's',
          timestamp: '2026-05-10T00:00:00.000Z',
          stage: 'author',
          input_tokens: 100,
          output_tokens: 50,
          cost_usd: 0.001,
          prompt_version: { author: 'v2.0' },
        },
      ],
    };
    expect(ajv.validate(schema, data)).toBe(true);
  });
});
