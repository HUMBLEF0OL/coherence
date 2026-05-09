/**
 * observations.md — append low-confidence findings and canonical demotions.
 * FR-STOP-21, FR-PERMISSION-9
 */
import type { StateStore } from './stateStore.js';
import { nowIsoUtc } from '../util/time.js';
import type { SectionRef } from '../types/index.js';

export interface ObservationEntry {
  type: 'low-confidence' | 'demoted-canonical';
  sectionRef?: SectionRef;
  demotedCount?: number;
  reason?: string;
}

export async function appendObservation(
  store: StateStore,
  entry: ObservationEntry,
): Promise<void> {
  const ts = nowIsoUtc();
  let line: string;

  if (entry.type === 'demoted-canonical' && entry.demotedCount !== undefined) {
    line = `- \`${ts}\` ${entry.demotedCount} other declared-canonical section(s) were treated as references for this change`;
  } else if (entry.type === 'low-confidence' && entry.sectionRef) {
    const reason = entry.reason ? `: ${entry.reason}` : '';
    line = `- \`${ts}\` low-confidence patch for \`${entry.sectionRef}\`${reason}`;
  } else {
    line = `- \`${ts}\` ${entry.type}`;
  }

  await store.appendMarkdown('observations.md', line);
}
