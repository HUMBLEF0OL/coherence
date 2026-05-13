/**
 * /coherence:trust — view + manage trust state and team sync (TS-5, v1.0 M1).
 *
 * Subcommands:
 *   (default)         — --status: human-readable Markdown report (5 sections)
 *   sync              — write personal summary to coherence/trust/<author-hash>.json
 *   --promote         — flip auto-land kinds for net-new files (FR-TRUST-4)
 *   --prune-stale     — remove team aggregate files older than 365 days
 */
import { unlinkSync, writeFileSync, mkdirSync, statSync, existsSync, renameSync } from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import {
  readLedger,
  writeLedger,
  checkPromoteEligibility,
  type AutoLandKind,
  type TrustLedger,
} from '../state/trustLedger.js';
import {
  computeAggregate,
  listTrustFiles,
  listPruneCandidates,
  trustDir,
  activeContributorCount,
} from '../state/teamAggregate.js';
import { getIdentity } from '../state/identity.js';
import { nowIsoUtc } from '../util/time.js';
import { emitMetric } from '../state/metrics.js';

export interface TrustCmdArgs {
  store: StateStore;
  projectRoot: string;
  argv: string[];
  sessionId: string;
}

const VALID_KINDS: AutoLandKind[] = ['annotate', 'skill', 'agent', 'slash_command'];

function getFlagValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1 || idx === argv.length - 1) return undefined;
  return argv[idx + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

export async function runTrust(args: TrustCmdArgs): Promise<string> {
  const { argv } = args;
  if (argv[0] === 'sync') return await handleSync(args);
  if (hasFlag(argv, '--promote')) return await handlePromote(args);
  if (hasFlag(argv, '--prune-stale')) return await handlePruneStale(args);
  return await handleStatus(args);
}

async function handleSync(args: TrustCmdArgs): Promise<string> {
  const { store, projectRoot, sessionId } = args;
  const identity = getIdentity();
  if (!/^[0-9a-f]{12}$/.test(identity.hash)) {
    throw new Error('coherence: cannot derive a valid author hash from git config user.email');
  }
  const ledger = await readLedger(store);
  const scores: Record<string, { score: number; as_of: string }> = {};
  for (const [ref, summary] of Object.entries(ledger.summary)) {
    scores[ref] = { score: summary.score, as_of: summary.as_of };
  }
  const teamFile = {
    schema_version: 3 as const,
    author_hash: identity.hash,
    last_synced_at: nowIsoUtc(),
    scores,
  };
  const dir = trustDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${identity.hash}.json`);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(teamFile, null, 2) + '\n', 'utf8');
  renameSync(tmpPath, filePath);
  await emitMetric(store, {
    event: 'trust_synced',
    session_id: sessionId,
    author_hash: identity.hash,
    section_count: Object.keys(scores).length,
  } as unknown as Parameters<typeof emitMetric>[1]);
  return `Synced ${Object.keys(scores).length} section(s) to coherence/trust/${identity.hash}.json`;
}

async function handlePromote(args: TrustCmdArgs): Promise<string> {
  const { store, argv, sessionId } = args;
  const eligibility = await checkPromoteEligibility(store);
  if (!eligibility.eligible) {
    if (eligibility.hint_emitted) {
      // Allow re-promote (changing auto-land kinds) after one-time hint, but
      // require eligibility recompute. If conditions are still met but
      // hint_emitted is true the eligibility flag drops to false; treat as
      // OK to re-promote.
      const ledger = await readLedger(store);
      const summaries = Object.values(ledger.summary);
      const hasScore = summaries.some((s) => s.score >= 0.85);
      const hasSections = summaries.filter((s) => s.score > 0).length >= 5;
      if (!hasScore || !hasSections) {
        return `Not eligible. Conditions met: score=${hasScore}, sections=${hasSections}`;
      }
    } else {
      const { score, sections, days } = eligibility.conditions_met;
      return `Not eligible. Conditions met: score=${score}, sections=${sections}, days=${days}`;
    }
  }
  const kindsArg = getFlagValue(argv, '--auto-land') ?? 'annotate';
  const requested = kindsArg
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  const invalid = requested.filter((k) => !VALID_KINDS.includes(k as AutoLandKind));
  if (invalid.length > 0) {
    throw new Error(`coherence: invalid --auto-land kind(s): ${invalid.join(', ')} (allowed: ${VALID_KINDS.join(', ')})`);
  }
  const kinds = requested as AutoLandKind[];
  const ledger = await readLedger(store);
  ledger.promoted_at = nowIsoUtc();
  ledger.auto_land_kinds = kinds;
  await writeLedger(store, ledger);
  await emitMetric(store, {
    event: 'trust_promoted',
    session_id: sessionId,
    auto_land_kinds: kinds,
    author_hash: getIdentity().hash,
  } as unknown as Parameters<typeof emitMetric>[1]);
  return `Promoted. Auto-land enabled for: ${kinds.join(', ')}.`;
}

async function handlePruneStale(args: TrustCmdArgs): Promise<string> {
  const { projectRoot, argv } = args;
  const yes = hasFlag(argv, '--yes');
  const candidates = listPruneCandidates(projectRoot);
  if (candidates.length === 0) return 'No stale trust files (none older than 365 days).';
  if (!yes) {
    return [
      `Found ${candidates.length} stale trust file(s) (older than 365 days):`,
      ...candidates.map((c) => `  - ${path.relative(projectRoot, c)}`),
      '',
      'Re-run with --yes to delete them.',
    ].join('\n');
  }
  const removed: string[] = [];
  for (const c of candidates) {
    try {
      unlinkSync(c);
      removed.push(path.relative(projectRoot, c));
    } catch {
      /* skip files we can't remove */
    }
  }
  return `Pruned ${removed.length} stale trust file(s):\n${removed.map((r) => `  - ${r}`).join('\n')}`;
}

async function handleStatus(args: TrustCmdArgs): Promise<string> {
  const { store, projectRoot } = args;
  const ledger = await readLedger(store);
  const eligibility = await checkPromoteEligibility(store);
  const aggregate = computeAggregate(projectRoot);
  const activeAuthors = activeContributorCount(projectRoot);
  const teamFiles = listTrustFiles(projectRoot);

  const lines: string[] = [];
  // Section (a): current trust state
  lines.push('## Trust state');
  lines.push(`- Mode: ${ledger.promoted_at ? `promoted (auto-land: ${ledger.auto_land_kinds.join(', ') || 'none'})` : 'unpromoted'}`);
  lines.push(`- Personal sections tracked: ${Object.keys(ledger.summary).length}`);
  lines.push(`- Promote hint already emitted: ${ledger.promote_hint_emitted_at ? 'yes' : 'no'}`);

  // Section (b): top 5 highest personal scores
  const summaries = Object.entries(ledger.summary);
  const byScoreDesc = [...summaries].sort((a, b) => b[1].score - a[1].score);
  lines.push('');
  lines.push('## Top 5 highest personal scores');
  if (byScoreDesc.length === 0) lines.push('_No personal trust data yet._');
  for (const [ref, s] of byScoreDesc.slice(0, 5)) {
    lines.push(`- \`${ref}\` — ${s.score.toFixed(3)} (${s.event_count} events)`);
  }

  // Section (c): top 5 lowest personal scores
  const byScoreAsc = [...summaries].sort((a, b) => a[1].score - b[1].score);
  lines.push('');
  lines.push('## Top 5 lowest personal scores');
  if (byScoreAsc.length === 0) lines.push('_No personal trust data yet._');
  for (const [ref, s] of byScoreAsc.slice(0, 5)) {
    lines.push(`- \`${ref}\` — ${s.score.toFixed(3)} (${s.event_count} events)`);
  }

  // Section (d): team aggregate summary
  lines.push('');
  lines.push('## Team aggregate');
  lines.push(`- Trust files on disk: ${teamFiles.length}`);
  lines.push(`- Active contributors (synced in last 180 days): ${activeAuthors}`);
  let contestedCount = 0;
  for (const v of aggregate.values()) if (v.contested) contestedCount++;
  lines.push(`- Contested sections: ${contestedCount}`);

  // Section (e): promote eligibility
  lines.push('');
  lines.push('## Promote eligibility');
  const { score, sections, days } = eligibility.conditions_met;
  lines.push(`- score ≥ 0.85 in at least one section: ${score ? 'yes' : 'no'}`);
  lines.push(`- ≥ 5 distinct sections with score > 0: ${sections ? 'yes' : 'no'}`);
  lines.push(`- ledger spans ≥ 30 days: ${days ? 'yes' : 'no'}`);
  lines.push(`- eligible right now: ${eligibility.eligible ? 'yes — run /coherence:trust --promote --auto-land <kinds>' : 'no'}`);

  return lines.join('\n');
}

/** Helper exposed for net-new file gate relaxation (M1 Step 7). */
export async function isKindAutoLandable(store: StateStore, kind: AutoLandKind): Promise<boolean> {
  const ledger: TrustLedger = await readLedger(store);
  return ledger.promoted_at !== null && ledger.auto_land_kinds.includes(kind);
}

void existsSync;
void statSync;
