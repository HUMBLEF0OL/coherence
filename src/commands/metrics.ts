/**
 * /coherence:metrics — quality metrics report (TS-5/TS-6, v1.0 M3).
 *
 * Five sections rendered as Markdown:
 *   (1) Summary             — event counts (all-time + 30-day window)
 *   (2) Top drifting        — sections with most coherence-applied patches
 *   (3) Trust scores        — top 10 high + low personal scores with team aggregate
 *   (4) Cost trend          — 30-day Unicode sparkline from cost-ledger
 *   (5) Revert hotspots     — sections with revert rate ≥ --revert-threshold (%)
 *
 * `--out <path>` writes the report via the v0.4 sandbox helper.
 * `--since YYYY-MM-DD` filters all windows from that date forward.
 * `--revert-threshold <int 0..100>` overrides the default 20%.
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, statSync } from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import { getCoherenceDir } from '../state/init.js';
import { readLedger } from '../state/trustLedger.js';
import { computeAggregate } from '../state/teamAggregate.js';

export interface MetricsCmdArgs {
  store: StateStore;
  projectRoot: string;
  argv: string[];
  sessionId: string;
}

function getFlagValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1 || idx === argv.length - 1) return undefined;
  return argv[idx + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

function parseSince(value: string | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

interface MetricsLine {
  event?: string;
  sectionRef?: string;
  _ts?: string;
  cost_usd?: number;
  [k: string]: unknown;
}

function* readMetricsJsonl(coherenceDir: string): Generator<MetricsLine> {
  const fp = path.join(coherenceDir, 'metrics.jsonl');
  if (!existsSync(fp)) return;
  let raw: string;
  try {
    raw = readFileSync(fp, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      yield JSON.parse(t) as MetricsLine;
    } catch {
      /* skip malformed line */
    }
  }
}

function renderSummary(coherenceDir: string, sinceMs: number | null): string {
  const allTime: Record<string, number> = {};
  const last30: Record<string, number> = {};
  const cutoff30 = Date.now() - WINDOW_DAYS * DAY_MS;
  for (const line of readMetricsJsonl(coherenceDir)) {
    const ev = line.event;
    if (!ev) continue;
    const ts = line._ts ? Date.parse(line._ts) : NaN;
    if (sinceMs !== null && !Number.isNaN(ts) && ts < sinceMs) continue;
    allTime[ev] = (allTime[ev] ?? 0) + 1;
    if (!Number.isNaN(ts) && ts >= cutoff30) last30[ev] = (last30[ev] ?? 0) + 1;
  }
  const interesting = [
    'patch_applied',
    'patch_reverted',
    'proposal_accept_recorded',
    'proposal_edit_recorded',
    'proposal_revert_recorded',
  ];
  const lines: string[] = [];
  lines.push('## Summary');
  lines.push('| Event | All-time | Last 30 days |');
  lines.push('| ----- | -------: | -----------: |');
  for (const ev of interesting) {
    lines.push(`| ${ev} | ${allTime[ev] ?? 0} | ${last30[ev] ?? 0} |`);
  }
  return lines.join('\n');
}

function renderTopDrifting(coherenceDir: string, projectRoot: string, sinceMs: number | null): string {
  const counts = new Map<string, number>();
  for (const line of readMetricsJsonl(coherenceDir)) {
    if (line.event !== 'patch_applied' || !line.sectionRef) continue;
    const ts = line._ts ? Date.parse(line._ts) : NaN;
    if (sinceMs !== null && !Number.isNaN(ts) && ts < sinceMs) continue;
    counts.set(line.sectionRef, (counts.get(line.sectionRef) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length === 0) return '## Top drifting sections\n_No drift data yet._';
  const aggregate = computeAggregate(projectRoot);
  const lines: string[] = [];
  lines.push('## Top drifting sections');
  lines.push('| Section | Patches applied | Contested? |');
  lines.push('| ------- | --------------: | :--------: |');
  for (const [ref, n] of top) {
    const agg = aggregate.get(ref);
    const flag = agg?.contested ? '⚠' : '';
    lines.push(`| \`${ref}\` | ${n} | ${flag} |`);
  }
  return lines.join('\n');
}

async function renderTrustScores(store: StateStore, projectRoot: string): Promise<string> {
  const ledger = await readLedger(store);
  const aggregate = computeAggregate(projectRoot);
  const entries = Object.entries(ledger.summary);
  if (entries.length === 0) {
    return '## Trust scores\n_No trust data yet — run more sessions to accumulate metrics._';
  }
  const highest = [...entries].sort((a, b) => b[1].score - a[1].score).slice(0, 10);
  const lowest = [...entries].sort((a, b) => a[1].score - b[1].score).slice(0, 10);
  const lines: string[] = [];
  lines.push('## Trust scores');
  lines.push('### Top 10 highest (personal)');
  lines.push('| Section | Personal | Team aggregate (contribs, freshest) |');
  lines.push('| ------- | -------: | :---------------------------------- |');
  for (const [ref, s] of highest) {
    const agg = aggregate.get(ref);
    const aggCell = agg
      ? `${agg.aggregate_score.toFixed(2)} (${agg.contributing_authors}, ${agg.freshest_as_of.slice(0, 10)})`
      : '—';
    lines.push(`| \`${ref}\` | ${s.score.toFixed(3)} | ${aggCell} |`);
  }
  lines.push('');
  lines.push('### Top 10 lowest (personal)');
  lines.push('| Section | Personal | Team aggregate (contribs, freshest) |');
  lines.push('| ------- | -------: | :---------------------------------- |');
  for (const [ref, s] of lowest) {
    const agg = aggregate.get(ref);
    const aggCell = agg
      ? `${agg.aggregate_score.toFixed(2)} (${agg.contributing_authors}, ${agg.freshest_as_of.slice(0, 10)})`
      : '—';
    lines.push(`| \`${ref}\` | ${s.score.toFixed(3)} | ${aggCell} |`);
  }
  return lines.join('\n');
}

export function renderSparkline(daily: number[]): string {
  if (daily.length < 3) return '_< 3 sessions — no trend yet._';
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const max = Math.max(...daily);
  const min = Math.min(...daily);
  if (max === 0) return '▁'.repeat(daily.length);
  if (max === min) return '▄'.repeat(daily.length);
  return daily
    .map((v) => blocks[Math.floor(((v - min) / (max - min)) * 7)])
    .join('');
}

interface CostLedgerFile {
  entries?: Array<{ timestamp?: string; cost_usd?: number; _ts?: string; ts?: string }>;
}

function renderCostTrend(coherenceDir: string): string {
  const fp = path.join(coherenceDir, 'cost-ledger.json');
  if (!existsSync(fp)) return '## Cost trend\n_No cost-ledger data yet._';
  let data: CostLedgerFile;
  try {
    data = JSON.parse(readFileSync(fp, 'utf8')) as CostLedgerFile;
  } catch {
    return '## Cost trend\n_Cost ledger unreadable._';
  }
  const buckets = new Array<number>(WINDOW_DAYS).fill(0);
  const now = Date.now();
  for (const e of data.entries ?? []) {
    // cost-ledger.schema.json names the field `timestamp`; tolerate `_ts`/`ts` for forwards-compat
    const tsStr = e.timestamp ?? e._ts ?? e.ts;
    if (!tsStr || typeof e.cost_usd !== 'number') continue;
    const t = Date.parse(tsStr);
    if (Number.isNaN(t)) continue;
    const ageDays = Math.floor((now - t) / DAY_MS);
    if (ageDays < 0 || ageDays >= WINDOW_DAYS) continue;
    buckets[WINDOW_DAYS - 1 - ageDays] += e.cost_usd;
  }
  return ['## Cost trend (last 30 days)', renderSparkline(buckets)].join('\n');
}

function renderRevertHotspots(
  coherenceDir: string,
  revertThreshold: number,
  sinceMs: number | null,
): string {
  // Per-section accept/edit/revert counters from v1.0 telemetry
  const counts = new Map<string, { accept: number; edit: number; revert: number }>();
  for (const line of readMetricsJsonl(coherenceDir)) {
    const ev = line.event;
    if (!line.sectionRef) continue;
    const ts = line._ts ? Date.parse(line._ts) : NaN;
    if (sinceMs !== null && !Number.isNaN(ts) && ts < sinceMs) continue;
    if (
      ev !== 'proposal_accept_recorded' &&
      ev !== 'proposal_edit_recorded' &&
      ev !== 'proposal_revert_recorded'
    ) {
      continue;
    }
    const c = counts.get(line.sectionRef) ?? { accept: 0, edit: 0, revert: 0 };
    if (ev === 'proposal_accept_recorded') c.accept++;
    else if (ev === 'proposal_edit_recorded') c.edit++;
    else c.revert++;
    counts.set(line.sectionRef, c);
  }
  const rows: Array<{ ref: string; rate: number; counts: { accept: number; edit: number; revert: number } }> = [];
  for (const [ref, c] of counts) {
    const total = c.accept + c.edit + c.revert;
    if (total < 5) continue;
    const rate = c.revert / total;
    if (rate * 100 >= revertThreshold) rows.push({ ref, rate, counts: c });
  }
  rows.sort((a, b) => b.rate - a.rate);
  if (rows.length === 0) return '## Revert hotspots\n_No revert hotspots._';
  const lines: string[] = [];
  lines.push(`## Revert hotspots (revert rate ≥ ${revertThreshold}%)`);
  lines.push('| Section | Revert rate | Accept | Edit | Revert |');
  lines.push('| ------- | ----------: | -----: | ---: | -----: |');
  for (const r of rows) {
    lines.push(
      `| \`${r.ref}\` | ${(r.rate * 100).toFixed(1)}% | ${r.counts.accept} | ${r.counts.edit} | ${r.counts.revert} |`,
    );
  }
  return lines.join('\n');
}

function writeWithSandbox(projectRoot: string, outPath: string, content: string, allowOutOfTree: boolean): string {
  const resolved = path.resolve(projectRoot, outPath);
  const rel = path.relative(projectRoot, resolved);
  const escapes = rel.startsWith('..') || path.isAbsolute(rel);
  if (escapes && !allowOutOfTree) {
    throw new Error(`coherence: --out path '${outPath}' escapes project root (use --allow-out-of-tree to override)`);
  }
  if (escapes) console.error(`coherence: --out writing OUTSIDE project root: ${resolved}`);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const tmp = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, resolved);
  return resolved;
}

export async function runMetrics(args: MetricsCmdArgs): Promise<string> {
  const { store, projectRoot, argv } = args;
  const sinceMs = parseSince(getFlagValue(argv, '--since'));
  const out = getFlagValue(argv, '--out');
  const allowOutOfTree = hasFlag(argv, '--allow-out-of-tree');
  const rtRaw = getFlagValue(argv, '--revert-threshold');
  const revertThreshold = rtRaw === undefined ? 20 : parseInt(rtRaw, 10);
  if (Number.isNaN(revertThreshold) || revertThreshold < 0 || revertThreshold > 100) {
    throw new Error('coherence: --revert-threshold must be an integer in [0, 100]');
  }
  const coherenceDir = getCoherenceDir(projectRoot);
  const sections: string[] = [
    renderSummary(coherenceDir, sinceMs),
    renderTopDrifting(coherenceDir, projectRoot, sinceMs),
    await renderTrustScores(store, projectRoot),
    renderCostTrend(coherenceDir),
    renderRevertHotspots(coherenceDir, revertThreshold, sinceMs),
  ];
  const report = ['# /coherence:metrics', ...sections].join('\n\n---\n\n');
  if (out) {
    const dest = writeWithSandbox(projectRoot, out, report, allowOutOfTree);
    return `Wrote ${report.length} chars to ${path.relative(projectRoot, dest)}`;
  }
  return report;
}

void statSync;
