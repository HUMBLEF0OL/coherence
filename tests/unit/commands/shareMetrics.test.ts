/**
 * /coherence:share-metrics contract tests.
 * --anonymized redacts paths and hashes refs.
 * No network egress — file-write only.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { runShareMetrics } from '../../../src/commands/shareMetrics.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-share-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('/coherence:share-metrics', () => {
  it('requires confirmation before writing', async () => {
    const result = await runShareMetrics({
      anonymized: true,
      outputPath: path.join(tmpDir, 'out.jsonl'),
      coherenceDir: tmpDir,
    });
    expect(result.requiresConfirmation).toBe(true);
    expect(existsSync(path.join(tmpDir, 'out.jsonl'))).toBe(false);
  });

  it('writes output file when confirmed', async () => {
    const metricsPath = path.join(tmpDir, 'metrics.jsonl');
    writeFileSync(metricsPath, JSON.stringify({
      event: 'patch_proposed',
      session_id: 'abc',
      sectionRef: 'docs/api.md#intro',
      _ts: new Date().toISOString(),
    }) + '\n', 'utf8');

    const outPath = path.join(tmpDir, 'out.jsonl');
    const result = await runShareMetrics({
      anonymized: false,
      outputPath: outPath,
      coherenceDir: tmpDir,
      confirmed: true,
    });

    expect(result.lineCount).toBe(1);
    expect(existsSync(outPath)).toBe(true);
  });

  it('--anonymized redacts sectionRef and session_id', async () => {
    const metricsPath = path.join(tmpDir, 'metrics.jsonl');
    writeFileSync(metricsPath, JSON.stringify({
      event: 'patch_proposed',
      session_id: 'my-session',
      sectionRef: 'docs/api.md#intro',
      _ts: new Date().toISOString(),
    }) + '\n', 'utf8');

    const outPath = path.join(tmpDir, 'out-anon.jsonl');
    await runShareMetrics({
      anonymized: true,
      outputPath: outPath,
      coherenceDir: tmpDir,
      confirmed: true,
    });

    const outRaw = readFileSync(outPath, 'utf8');
    const record = JSON.parse(outRaw.trim()) as Record<string, unknown>;
    expect(record['sectionRef']).not.toBe('docs/api.md#intro');
    expect(record['session_id']).not.toBe('my-session');
    // Should be a hash
    expect(typeof record['sectionRef']).toBe('string');
    expect((record['sectionRef'] as string).length).toBe(12);
  });

  it('handles missing metrics.jsonl gracefully', async () => {
    const result = await runShareMetrics({
      anonymized: true,
      outputPath: path.join(tmpDir, 'out.jsonl'),
      coherenceDir: tmpDir,
      confirmed: true,
    });
    expect(result.lineCount).toBe(0);
    expect(result.message).toContain('No metrics.jsonl found');
  });
});
