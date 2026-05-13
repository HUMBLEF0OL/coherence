/**
 * v1.0 M3 — /coherence:audit free-tier token budget (M-AUDIT-1, FR-AUDIT-2).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import {
  classifyTokens,
  tierLabel,
  buildRows,
  tokenBudgetReport,
} from '../../src/audit/tokenBudget.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-tok-'));
  mkdirSync(path.join(tmp, '.claude', 'coherence'), { recursive: true });
});
afterEach(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } });

function seedIndex(entries: Array<{ sectionRef: string; content_length_chars: number }>): void {
  writeFileSync(
    path.join(tmp, '.claude', 'coherence', 'section-index.json'),
    JSON.stringify({ entries }),
    'utf8',
  );
}

describe('token budget tiers', () => {
  it('< 2000 tokens → Normal', () => {
    expect(classifyTokens(0)).toBe('Normal');
    expect(classifyTokens(1999)).toBe('Normal');
  });
  it('2000..5000 tokens → Large', () => {
    expect(classifyTokens(2000)).toBe('Large');
    expect(classifyTokens(5000)).toBe('Large');
  });
  it('> 5000 tokens → Bloated', () => {
    expect(classifyTokens(5001)).toBe('Bloated');
    expect(classifyTokens(50000)).toBe('Bloated');
  });
  it('tierLabel decorates the values', () => {
    expect(tierLabel('Normal')).toBe('Normal');
    expect(tierLabel('Large')).toContain('Large');
    expect(tierLabel('Bloated')).toContain('Bloated');
  });
  it('buildRows computes ceil(chars/4)', () => {
    const rows = buildRows([
      { sectionRef: 'a#s', content_length_chars: 3 }, // ceil(3/4) = 1
      { sectionRef: 'b#s', content_length_chars: 8000 }, // 2000
    ]);
    expect(rows[0].tokens).toBe(1);
    expect(rows[1].tokens).toBe(2000);
    expect(rows[1].tier).toBe('Large');
  });
});

describe('tokenBudgetReport', () => {
  it('empty index → helpful empty-state message', async () => {
    const report = await tokenBudgetReport(tmp);
    expect(report).toContain('No section-index entries yet');
  });
  it('renders Markdown table sorted desc by tokens', async () => {
    seedIndex([
      { sectionRef: 'small.md#x', content_length_chars: 100 },
      { sectionRef: 'huge.md#x', content_length_chars: 24000 },
      { sectionRef: 'mid.md#x', content_length_chars: 8000 },
    ]);
    const report = await tokenBudgetReport(tmp);
    expect(report).toContain('Section | Tokens');
    const iHuge = report.indexOf('huge.md#x');
    const iMid = report.indexOf('mid.md#x');
    const iSmall = report.indexOf('small.md#x');
    expect(iHuge).toBeGreaterThan(-1);
    expect(iHuge).toBeLessThan(iMid);
    expect(iMid).toBeLessThan(iSmall);
  });
});
