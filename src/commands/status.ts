/**
 * /coherence:status — canonical fixed-order output.
 * DD-055, NFR-OBS-4, TS-7 §7.4
 * Output order: header → capabilities → sentinels → buffer → recent activity →
 *   subagent stats → velocity → cost.
 * DD-044 footer always present.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import type {
  CoherenceConfig,
  HostCapabilities,
  VelocityState,
  SubagentStats,
  VersionInfo,
} from '../types/index.js';
import type { DriftBuffer } from '../buffer/lifecycle.js';
import { readGraduation } from '../state/graduation.js';
import { resolveMode } from '../modes/resolver.js';
import type { ProposalCache } from '../state/proposalCache.js';

const DD_044_FOOTER =
  'Mid-session branch switches: not detected — Stop-time re-validation';

export interface StatusOutput {
  lines: string[];
  elapsedMs: number;
}

export async function runStatus(
  store: StateStore,
  coherenceDir: string,
): Promise<StatusOutput> {
  const start = Date.now();
  const lines: string[] = [];

  // Header
  const version = await store.read<VersionInfo>('version.json');
  const config = await store.read<CoherenceConfig>('config.json');
  const mode = config?.mode ?? 'observe';
  lines.push(`[coherence] status — plugin ${version?.plugin_version ?? '0.1.0'} | mode: ${mode}`);

  // G7 fix: FR-MODES-7 — surface effective v0.2 mode for cwd.
  try {
    const graduation = await readGraduation(store);
    const effective = resolveMode({ graduation, targetPath: '.' });
    lines.push(
      `  v0.2 mode: global=${graduation.global_mode}, effective(cwd)=${effective}, scopes=${graduation.scopes.length}`,
    );
  } catch {
    /* graduation.json not present (pre-migration); skip silently */
  }

  // Surface proposal counts (v0.2).
  try {
    const cache = await store.read<ProposalCache>('proposal-cache.json');
    if (cache) {
      let queued = 0,
        surfaced = 0,
        ignored = 0;
      for (const e of cache.entries) {
        if (e.state === 'queued') queued += 1;
        else if (e.state === 'surfaced') surfaced += 1;
        else if (e.state === 'ignored') ignored += 1;
      }
      lines.push(
        `  proposals: ${queued} queued, ${surfaced} surfaced, ${ignored} ignored`,
      );
    }
  } catch {
    /* fall through */
  }
  lines.push('');

  // v0.3 M4: telemetry consent line.
  try {
    const { readTelemetryConsent } = await import('../state/consent.js');
    const consent = await readTelemetryConsent(store);
    if (consent) {
      lines.push(
        `  Telemetry: local=${consent.local_collection ? 'on' : 'off'}, upload=${consent.upload_consent ? 'on' : 'off'}` +
          (consent.non_interactive_default ? ' (defaults; will re-prompt next interactive session)' : ''),
      );
    } else {
      lines.push('  Telemetry: not yet recorded (will prompt at next SessionStart)');
    }
  } catch {
    /* consent module non-fatal */
  }

  // Capabilities
  const caps = await store.read<HostCapabilities>('host-capabilities.json');
  if (caps) {
    lines.push('Capabilities:');
    lines.push(`  subagent_attribution: ${caps.subagent_attribution}`);
    lines.push(`  frontmatter_preserves_unknown_keys: ${caps.frontmatter_preserves_unknown_keys}`);
    lines.push(`  token_count_in_posttooluse: ${caps.token_count_in_posttooluse}`);
    if (caps.host_version) lines.push(`  host_version: ${caps.host_version}`);
    lines.push('');
  }

  // Sentinels
  const disabledPath = path.join(coherenceDir, 'DISABLED');
  const autoDisabledPath = path.join(coherenceDir, 'auto-disabled');
  const hasManual = existsSync(disabledPath);
  const hasAuto = existsSync(autoDisabledPath);
  if (hasManual || hasAuto) {
    lines.push('Sentinels:');
    if (hasManual) lines.push('  ⛔ DISABLED (manual kill-switch active)');
    if (hasAuto) lines.push('  ⚠ auto-disabled (run /coherence:recover to clear)');
    lines.push('');
  }

  // Buffer
  const buf = await store.read<DriftBuffer>('drift-buffer.json');
  const entryCount = buf?.entries.length ?? 0;
  lines.push(`Buffer: ${entryCount} pending section(s) | state: ${buf?.state ?? 'empty'}`);
  if (entryCount > 0 && buf) {
    const shown = buf.entries.slice(0, 5);
    for (const e of shown) {
      lines.push(`  • ${e.sectionRef}`);
    }
    if (entryCount > 5) lines.push(`  … and ${entryCount - 5} more`);
  }
  lines.push('');

  // Recent activity — read last 5 lines from coherence-log.md
  const logPath = path.join(coherenceDir, 'coherence-log.md');
  if (existsSync(logPath)) {
    const logRaw = readFileSync(logPath, 'utf8');
    const headingMatches = logRaw.match(/^## \d{4}-\d{2}-\d{2}T[^\n]*/gm) ?? [];
    const recent = headingMatches.slice(0, 3);
    if (recent.length > 0) {
      lines.push('Recent activity:');
      for (const h of recent) lines.push(`  ${h.replace(/^## /, '')}`);
      lines.push('');
    }
  }

  // Subagent stats
  const stats = await store.read<SubagentStats>('subagent-stats.json');
  if (stats) {
    lines.push('Subagent stats:');
    lines.push(`  accepted: ${stats.accepted}  edited: ${stats.edited}  discarded: ${stats.discarded}  rejected: ${stats.rejected}`);
    if (stats.trend_last5_vs_prior10 !== undefined) {
      const trend = stats.trend_last5_vs_prior10 > 0 ? `+${stats.trend_last5_vs_prior10.toFixed(2)}` : stats.trend_last5_vs_prior10.toFixed(2);
      lines.push(`  trend (last5 vs prior10): ${trend}`);
    }
    lines.push('');
  }

  // Velocity
  const velocity = await store.read<VelocityState>('velocity.json');
  if (velocity) {
    const autoIgnored = velocity.auto_ignored.length;
    const reverts = velocity.revert_count;
    if (reverts > 0 || autoIgnored > 0) {
      lines.push('Velocity:');
      if (reverts > 0) lines.push(`  reverts in window: ${reverts}`);
      if (autoIgnored > 0) lines.push(`  auto-ignored sections: ${autoIgnored}`);
      lines.push('');
    }
  }

  // Cost (last entry from cost-ledger.json)
  const costLedger = await store.read<{ entries: Array<{ cost_usd: number; timestamp: string }> }>('cost-ledger.json');
  if (costLedger?.entries && costLedger.entries.length > 0) {
    const last = costLedger.entries[costLedger.entries.length - 1];
    const total = costLedger.entries.reduce((s, e) => s + e.cost_usd, 0);
    lines.push(`Cost: last stop $${last.cost_usd.toFixed(4)} | session total $${total.toFixed(4)}`);
    lines.push('');
  }

  // DD-044 footer (always present)
  lines.push(`[limitation] ${DD_044_FOOTER}`);

  const elapsedMs = Date.now() - start;
  return { lines, elapsedMs };
}

export function formatStatus(output: StatusOutput): string {
  return output.lines.join('\n');
}
