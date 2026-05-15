/**
 * Statusline badge for Claude Code (v0.2 — DD-070, DD-071).
 *
 * v0.1 contract retained: `computeStatusline(store, mode, degraded)` returns
 * `{text, degraded}` based on drift-buffer count + mode.
 *
 * v0.2 additions:
 *   - `renderClickAffordance` produces an OSC 8 / OSC 52 / plain segment
 *     based on host-capabilities probe.
 *   - `computeFromSnapshot` reads `state-snapshot.json` for the bin scripts.
 *
 * FR-STATUSLINE-1..10. Cancellation-safe single atomic-read pattern.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import type { CoherenceMode } from '../types/index.js';
import type { V02Mode } from '../state/graduation.js';

export interface StatuslineBadge {
  text: string;
  degraded: boolean;
}

export interface ClickAffordance {
  tier: 'claude_url' | 'osc8' | 'osc52' | 'plain';
  rendered: string;
}

export type TerminalHyperlinkTier = 'osc8' | 'osc52' | 'plain';

export interface HostCapabilitiesV02 {
  subagent_attribution?: boolean;
  frontmatter_preserves_unknown_keys?: boolean;
  hook_event_shapes?: Record<string, string>;
  token_count_in_posttooluse?: boolean;
  /** v0.2 (DD-090) */
  terminal_hyperlink?: TerminalHyperlinkTier;
  /** v0.2 (DD-090) */
  claude_url_scheme_supported?: boolean;
}

export async function computeStatusline(
  store: StateStore,
  mode: CoherenceMode | V02Mode,
  degraded: boolean,
): Promise<StatuslineBadge> {
  if (degraded) {
    return { text: '[🧭 ⚠]', degraded: true };
  }

  const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');
  const bufCount = buf?.entries.length ?? 0;

  // G8 fix: surface v0.2 surfaced-proposal counts when present.
  const cache = await store.read<{
    entries: Array<{ state: string }>;
  }>('proposal-cache.json');
  let surfaced = 0;
  let queued = 0;
  for (const e of cache?.entries ?? []) {
    if (e.state === 'surfaced') surfaced += 1;
    else if (e.state === 'queued') queued += 1;
  }

  if (bufCount === 0 && surfaced === 0 && queued === 0) {
    return { text: '', degraded: false };
  }

  const modeIndicator =
    mode === 'author'
      ? 'A'
      : mode === 'annotate'
      ? 'N'
      : mode === 'graduated'
      ? 'G'
      : 'O';

  if (surfaced > 0) {
    return {
      text: `[🧭 ${surfaced}${modeIndicator} → /coherence:propose list]`,
      degraded: false,
    };
  }
  if (queued > 0) {
    return { text: `[🧭 ${queued}q${modeIndicator}]`, degraded: false };
  }
  return { text: `[🧭 ${bufCount}${modeIndicator}]`, degraded: false };
}

export function formatStatusline(badge: StatuslineBadge): string {
  return badge.text;
}

/**
 * Render a click affordance for a slash command, gated by host capabilities
 * (DD-071 three-tier graceful degradation).
 *
 * Honours `FORCE_HYPERLINK=1` env override.
 */
export function renderClickAffordance(
  label: string,
  slashCommand: string,
  caps: HostCapabilitiesV02,
  env: NodeJS.ProcessEnv = process.env,
): ClickAffordance {
  const forced = env['FORCE_HYPERLINK'] === '1';
  const tier: TerminalHyperlinkTier =
    forced && (!caps.terminal_hyperlink || caps.terminal_hyperlink === 'plain')
      ? 'osc8'
      : caps.terminal_hyperlink ?? 'plain';

  if (caps.claude_url_scheme_supported) {
    const uri = `claude://run/${slashCommand.replace(/^\//, '')}`;
    return {
      tier: 'claude_url',
      rendered: `\x1b]8;;${uri}\x07${label}\x1b]8;;\x07`,
    };
  }
  if (tier === 'osc8') {
    const uri = `claude://run/${slashCommand.replace(/^\//, '')}`;
    return {
      tier: 'osc8',
      rendered: `\x1b]8;;${uri}\x07${label}\x1b]8;;\x07`,
    };
  }
  if (tier === 'osc52') {
    const payload = Buffer.from(slashCommand, 'utf8').toString('base64');
    return {
      tier: 'osc52',
      rendered: `\x1b]52;c;${payload}\x07${label}`,
    };
  }
  return { tier: 'plain', rendered: `${label} → ${slashCommand}` };
}

/**
 * Cancellation-safe statusline read used by the bin scripts.
 * Single atomic file-existence + read; no multi-step computation
 * (FR-STATUSLINE-6).
 */
export function readSnapshot(coherenceDir: string): string {
  const snapshotPath = path.join(coherenceDir, 'state-snapshot.json');
  if (!existsSync(snapshotPath)) return '';
  try {
    const raw = readFileSync(snapshotPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      buffer_count?: number;
      proposal_counts?: { queued?: number; surfaced?: number };
      mode?: V02Mode;
      degraded?: boolean;
    };
    if (parsed.degraded) return '[🧭 ⚠]';
    const surfaced = parsed.proposal_counts?.surfaced ?? 0;
    const queued = parsed.proposal_counts?.queued ?? 0;
    const buffer = parsed.buffer_count ?? 0;
    if (surfaced + queued + buffer === 0) return '';
    const modeChar =
      parsed.mode === 'author' ? 'A' : parsed.mode === 'annotate' ? 'N' : 'O';
    if (surfaced > 0) return `[🧭 ${surfaced}${modeChar} → /coherence:propose list]`;
    if (queued > 0) return `[🧭 ${queued}q${modeChar}]`;
    return `[🧭 ${buffer}${modeChar}]`;
  } catch {
    return '';
  }
}
