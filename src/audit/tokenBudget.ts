/**
 * Section token budget — char-count-based estimation (TS-6, FR-AUDIT-2).
 *
 * Reads `.claude/coherence/section-index.json`. Approximates token count as
 * `ceil(content_length_chars / 4)`. Tiers:
 *   < 2000           → Normal
 *   2000..5000       → ⚠ Large
 *   > 5000           → ❌ Bloated
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';

interface SectionIndexEntry {
  sectionRef: string;
  content_length_chars?: number;
  heading?: string;
}

interface SectionIndex {
  schema_version: number;
  entries?: SectionIndexEntry[];
  sections?: SectionIndexEntry[];
}

function indexPath(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'coherence', 'section-index.json');
}

export interface SectionTokenRow {
  sectionRef: string;
  tokens: number;
  tier: 'Normal' | 'Large' | 'Bloated';
}

export function readSectionIndex(projectRoot: string): SectionIndexEntry[] {
  const p = indexPath(projectRoot);
  if (!existsSync(p)) return [];
  try {
    const data = JSON.parse(readFileSync(p, 'utf8')) as SectionIndex;
    return data.entries ?? data.sections ?? [];
  } catch {
    return [];
  }
}

export function classifyTokens(tokens: number): SectionTokenRow['tier'] {
  if (tokens < 2000) return 'Normal';
  if (tokens <= 5000) return 'Large';
  return 'Bloated';
}

export function tierLabel(t: SectionTokenRow['tier']): string {
  if (t === 'Normal') return 'Normal';
  if (t === 'Large') return '⚠ Large';
  return '❌ Bloated (consider splitting)';
}

export function buildRows(entries: SectionIndexEntry[]): SectionTokenRow[] {
  return entries.map((e) => {
    const tokens = Math.ceil((e.content_length_chars ?? 0) / 4);
    return { sectionRef: e.sectionRef, tokens, tier: classifyTokens(tokens) };
  });
}

export async function tokenBudgetReport(projectRoot: string): Promise<string> {
  const entries = readSectionIndex(projectRoot);
  const rows = buildRows(entries).sort((a, b) => b.tokens - a.tokens);
  if (rows.length === 0) return '_No section-index entries yet — run a session to populate._';
  const lines: string[] = [];
  lines.push('| Section | Tokens | Tier |');
  lines.push('| ------- | -----: | ---- |');
  // Cap displayed rows at 50 to keep the report manageable
  for (const r of rows.slice(0, 50)) {
    lines.push(`| \`${r.sectionRef}\` | ${r.tokens} | ${tierLabel(r.tier)} |`);
  }
  if (rows.length > 50) lines.push(`_… ${rows.length - 50} more not shown_`);
  return lines.join('\n');
}
