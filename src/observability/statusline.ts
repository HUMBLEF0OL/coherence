/**
 * Statusline badge for Claude Code.
 * FR-PERMISSION-7, TS-7 §7.3
 * [🧭 N] — buffer has N pending entries
 * [🧭 ⚠] — degraded mode
 * Hidden (empty string) when buffer is empty and not degraded.
 */
import type { StateStore } from '../state/stateStore.js';
import type { CoherenceMode } from '../types/index.js';

export interface StatuslineBadge {
  text: string;
  degraded: boolean;
}

export async function computeStatusline(
  store: StateStore,
  mode: CoherenceMode,
  degraded: boolean,
): Promise<StatuslineBadge> {
  if (degraded) {
    return { text: '[🧭 ⚠]', degraded: true };
  }

  const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');
  const count = buf?.entries.length ?? 0;

  if (count === 0) {
    return { text: '', degraded: false };
  }

  const modeIndicator = mode === 'graduated' ? 'G' : 'O';
  return { text: `[🧭 ${count}${modeIndicator}]`, degraded: false };
}

export function formatStatusline(badge: StatuslineBadge): string {
  return badge.text;
}
