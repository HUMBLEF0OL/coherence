/**
 * Rolling 50-window subagent stats + threshold detection.
 * FR-LAYERS-3..4: >25% discard / >50% edit / sudden shift >20pp last5 vs prior10
 */
import type { SubagentStats } from '../types/index.js';
import type { SubagentClassification } from './tracker.js';

const WINDOW_SIZE = 50;

export function initialStats(): SubagentStats {
  return {
    window_size: 0,
    accepted: 0,
    edited: 0,
    discarded: 0,
    rejected: 0,
  };
}

export function addClassification(
  stats: SubagentStats,
  classification: SubagentClassification,
): SubagentStats {
  const updated = { ...stats };
  updated.window_size = Math.min(stats.window_size + 1, WINDOW_SIZE);
  updated[classification]++;
  return updated;
}

export interface ThresholdAlert {
  type: 'high-discard' | 'high-edit' | 'sudden-shift';
  message: string;
}

export function detectThresholds(
  stats: SubagentStats,
  last5: SubagentStats,
  prior10: SubagentStats,
): ThresholdAlert[] {
  const alerts: ThresholdAlert[] = [];
  const total = stats.accepted + stats.edited + stats.discarded + stats.rejected;
  if (total === 0) return alerts;

  const discardPct = (stats.discarded / total) * 100;
  const editPct = (stats.edited / total) * 100;

  if (discardPct > 25) {
    alerts.push({ type: 'high-discard', message: `Discard rate ${discardPct.toFixed(1)}% > 25%` });
  }

  if (editPct > 50) {
    alerts.push({ type: 'high-edit', message: `Edit rate ${editPct.toFixed(1)}% > 50%` });
  }

  // Sudden shift: last5 vs prior10
  const last5Total = last5.accepted + last5.edited + last5.discarded + last5.rejected;
  const prior10Total = prior10.accepted + prior10.edited + prior10.discarded + prior10.rejected;

  if (last5Total > 0 && prior10Total > 0) {
    const last5DiscardPct = (last5.discarded / last5Total) * 100;
    const prior10DiscardPct = (prior10.discarded / prior10Total) * 100;
    const shift = last5DiscardPct - prior10DiscardPct;

    if (Math.abs(shift) > 20) {
      alerts.push({
        type: 'sudden-shift',
        message: `Sudden shift ${shift > 0 ? '+' : ''}${shift.toFixed(1)}pp on last5 vs prior10`,
      });
    }
  }

  return alerts;
}
