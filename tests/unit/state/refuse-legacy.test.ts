/**
 * v0.3 NFR-COMPAT-N4 — refuseLegacy() outcomes.
 *
 * Per DD-118 each major version stands alone; SessionStart consults
 * refuseLegacy() in place of the retired migration chain. Three outcomes:
 *   1. fresh install (no version.json)
 *   2. pre-v3 refusal (schema_version === 1 or 2)
 *   3. current v3 (schema_version === 3) → proceed
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  refuseLegacy,
  REFUSE_LEGACY_MESSAGE,
} from '../../../src/state/refuseLegacy.js';

let tmp: string;
let coherenceDir: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'coherence-refuse-'));
  coherenceDir = path.join(tmp, '.claude', 'coherence');
  mkdirSync(coherenceDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('refuseLegacy (v0.3 NFR-COMPAT-N4, DD-118)', () => {
  it('fresh install (no version.json) returns status: fresh', () => {
    const r = refuseLegacy(coherenceDir);
    expect(r.status).toBe('fresh');
  });

  it('pre-v3 schema_version 1 is refused with the canonical message', () => {
    writeFileSync(
      path.join(coherenceDir, 'version.json'),
      JSON.stringify({ schema_version: 1, plugin_version: '0.1.0' }),
    );
    const r = refuseLegacy(coherenceDir);
    expect(r.status).toBe('refuse');
    if (r.status === 'refuse') {
      expect(r.foundSchemaVersion).toBe(1);
      expect(r.message).toBe(REFUSE_LEGACY_MESSAGE);
    }
  });

  it('pre-v3 schema_version 2 is refused', () => {
    writeFileSync(
      path.join(coherenceDir, 'version.json'),
      JSON.stringify({ schema_version: 2, plugin_version: '0.2.0' }),
    );
    const r = refuseLegacy(coherenceDir);
    expect(r.status).toBe('refuse');
    if (r.status === 'refuse') {
      expect(r.foundSchemaVersion).toBe(2);
    }
  });

  it('current v3 sentinel proceeds', () => {
    writeFileSync(
      path.join(coherenceDir, 'version.json'),
      JSON.stringify({ schema_version: 3, plugin_version: '0.3.0-pre.0' }),
    );
    const r = refuseLegacy(coherenceDir);
    expect(r.status).toBe('proceed');
    if (r.status === 'proceed') {
      expect(r.schemaVersion).toBe(3);
    }
  });

  it('corrupt version.json is refused (operator must resolve before continuing)', () => {
    writeFileSync(path.join(coherenceDir, 'version.json'), '{not json');
    const r = refuseLegacy(coherenceDir);
    expect(r.status).toBe('refuse');
  });
});
