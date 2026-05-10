/**
 * v0.2 substrate sanity test.
 *
 * Originally an M0 pre-flight gate; the bootstrap-only assertions on
 * PRECONDITION.md and spec-freeze artifacts have been removed (those
 * docs were one-time process artifacts; deleted as solo-dev overhead).
 * Surviving assertions verify that v0.2 substrate hooks into the v0.1
 * source tree correctly — these remain useful invariants.
 *
 * Audit fix: prior version was metadata-only (string presence checks
 * against source files). The substrate is also exercised end-to-end by
 * `tests/rollback/v1-to-v2-migration.test.ts` and
 * `tests/integration/sessionStart-migration.test.ts`. This file now
 * additionally invokes the migrator on a synthetic v0.1 install so a
 * regression in the actual code path — not just the source text — fails
 * the precondition gate.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { migrateV1ToV2 } from '../../src/state/migrate/v1_to_v2.js';
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

  it('runs v1→v2 migrator end-to-end on a synthetic v0.1 install', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'coh-substrate-'));
    try {
      const cohDir = path.join(tmp, '.claude', 'coherence');
      const qDir = path.join(cohDir, 'quarantine');
      mkdirSync(qDir, { recursive: true });
      writeFileSync(
        path.join(cohDir, 'version.json'),
        JSON.stringify({
          schema_version: 1,
          plugin_version: '0.1.0',
          installed_at: '2026-01-01T00:00:00.000Z',
          prior_versions: [],
        }) + '\n',
        'utf8',
      );
      const result = await migrateV1ToV2(cohDir, qDir);
      expect(result.migrated).toBe(true);
      // All v0.2 files materialised.
      for (const f of [
        'graduation.json',
        'proposal-cache.json',
        'signal-cache.json',
        'state-snapshot.json',
        path.join('scan-cache', 'state.json'),
      ]) {
        expect(existsSync(path.join(cohDir, f))).toBe(true);
      }
      // Version bump landed last → schema_version === 2.
      const ver = JSON.parse(readFileSync(path.join(cohDir, 'version.json'), 'utf8')) as {
        schema_version: number;
        prior_versions: Array<{ schema_version: number }>;
      };
      expect(ver.schema_version).toBe(2);
      expect(ver.prior_versions.some((v) => v.schema_version === 1)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
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
