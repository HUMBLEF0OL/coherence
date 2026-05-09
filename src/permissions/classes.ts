/**
 * Change-class gating — determines auto-apply vs confirm.
 * FR-PERMISSION-1..3, FR-PERMISSION-5
 * Additive: auto-apply in Graduated mode, confirm in Observe.
 * Modifying/Destructive: always confirm.
 * Frontmatter: always confirm regardless of mode.
 */
import type { ChangeClass, CoherenceMode } from '../types/index.js';

export type GateDecision = 'auto-apply' | 'confirm';

export function gateChangeClass(
  changeClass: ChangeClass,
  mode: CoherenceMode,
): GateDecision {
  if (changeClass === 'frontmatter') {
    return 'confirm';
  }

  if (changeClass === 'additive' && mode === 'graduated') {
    return 'auto-apply';
  }

  return 'confirm';
}

export function requiresConfirmation(changeClass: ChangeClass, mode: CoherenceMode): boolean {
  return gateChangeClass(changeClass, mode) === 'confirm';
}
