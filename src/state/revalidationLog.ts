/**
 * Revalidation log — append entry-drop reasons and Stage-2 validation failures.
 * FR-OBS-4, NFR-OBS-3
 */
import { StateStore } from './stateStore.js';
import { nowIsoUtc } from '../util/time.js';

export type RevalidationReason =
  | 'stale'
  | 'schema-invalid'
  | 'content-hash-mismatch'
  | 'stage2-validation-failed'
  | 'line-ratio-exceeded'
  | 'hallucination-detected'
  | 'prompt-injection';

export interface RevalidationEntry {
  timestamp: string;
  sectionRef: string;
  reason: RevalidationReason;
  detail?: string;
}

export class RevalidationLog {
  constructor(private readonly store: StateStore) {}

  async append(entry: Omit<RevalidationEntry, 'timestamp'>): Promise<void> {
    const line = JSON.stringify({
      ...entry,
      timestamp: nowIsoUtc(),
    });
    // Append as line to revalidation-log.md (markdown-friendly JSONL)
    await this.store.appendMarkdown('revalidation-log.md', `<!-- ${line} -->`);
  }
}
