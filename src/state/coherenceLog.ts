/**
 * Append-only coherence-log.md entries (DD-052 table-shaped variants).
 * TS-3 §3.11, FR-OBS-1, NFR-OBS-1
 */
import type { StateStore } from './stateStore.js';
import { nowIsoUtc } from '../util/time.js';

export type CoherenceLogEventType = 'auto-applied' | 'reviewed' | 'finalize' | 'quarantine';

export interface CoherenceLogEntry {
  type: CoherenceLogEventType;
  timestamp: string;
  gitRef: string | null;
  summary: string;
  sectionRefs: string[];
}

/**
 * Append a newest-first table entry to coherence-log.md.
 * Format per DD-052: | timestamp | type | summary | git-ref |
 */
export async function appendCoherenceLog(
  store: StateStore,
  entry: Omit<CoherenceLogEntry, 'timestamp'>,
): Promise<void> {
  const ts = nowIsoUtc();
  const ref = entry.gitRef ? `\`${entry.gitRef.slice(0, 8)}\`` : '—';
  const sections = entry.sectionRefs.map((r) => `- \`${r}\``).join('\n');

  const block = [
    `## ${ts} — ${entry.type}`,
    '',
    `**Summary:** ${entry.summary}`,
    `**Git ref:** ${ref}`,
    sections ? `**Sections:**\n${sections}` : null,
    '',
    '---',
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');

  await store.appendMarkdown('coherence-log.md', block);
}
