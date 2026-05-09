/**
 * Session-scoped cost ledger — tracks per-call costs and persists to cost-ledger.json.
 * DD-057, FR-OBS-6
 */
import type { StateStore } from '../state/stateStore.js';
import type { CostEntry } from '../types/index.js';
import { nowIsoUtc } from '../util/time.js';

export interface CostLedgerFile {
  session_id: string;
  entries: CostEntry[];
}

export class CostLedger {
  private entries: CostEntry[] = [];

  constructor(
    private readonly store: StateStore,
    private readonly sessionId: string,
  ) {}

  record(entry: Omit<CostEntry, 'session_id' | 'timestamp'>): void {
    this.entries.push({
      ...entry,
      session_id: this.sessionId,
      timestamp: nowIsoUtc(),
    });
  }

  async flush(): Promise<void> {
    const ledger: CostLedgerFile = {
      session_id: this.sessionId,
      entries: this.entries,
    };
    await this.store.write('cost-ledger.json', ledger);
  }

  totalCostUsd(): number {
    return this.entries.reduce((sum, e) => sum + e.cost_usd, 0);
  }

  reset(): void {
    this.entries = [];
  }

  getEntries(): readonly CostEntry[] {
    return this.entries;
  }
}
