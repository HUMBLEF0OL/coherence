/**
 * Session-scoped cost ledger — tracks per-call costs and persists to cost-ledger.json.
 * DD-057, FR-OBS-6, DD-085 (v0.2 cost ceiling enforcement).
 */
import type { StateStore } from '../state/stateStore.js';
import type { CostEntry } from '../types/index.js';
import { nowIsoUtc } from '../util/time.js';
import { emitMetric } from '../state/metrics.js';

export interface CostLedgerFile {
  session_id: string;
  entries: CostEntry[];
}

/**
 * DD-085 cost ceiling. v0.1 baseline p95 = $0.15/session; v0.2 admits a
 * +30% headroom for the new Author + Annotate + Trickle work, partitioned
 * 60/30/10 across the three new pipelines (TS-7 §2.1).
 */
export const V01_BASELINE_USD_P95 = 0.15;
export const V02_CEILING_MULTIPLIER = 1.3;
export const V02_COST_CEILING_USD = V01_BASELINE_USD_P95 * V02_CEILING_MULTIPLIER;
/** Per-stage shares of the +30% headroom (DD-085 partition). */
export const V02_PARTITION = {
  author: 0.6,
  annotate: 0.3,
  trickle: 0.1, // bookkeeping only — trickle does no LLM work in v0.2.
} as const;

type StageKey = 'stage1' | 'stage2' | 'author' | 'annotate' | 'author_planner';

export class CostLedger {
  private entries: CostEntry[] = [];
  private ceilingEmitted = false;

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

    // DD-085: emit cost_ceiling_hit (at most once per ledger lifetime) when
    // either the aggregate session total or any stage partition exceeds its
    // budget. Telemetry-only — does not block writes (the v0.2 plan reserves
    // hard cutoffs for the degrade-to-no-LLM path, DD-061).
    await this.checkAndEmitCeiling();
  }

  private async checkAndEmitCeiling(): Promise<void> {
    if (this.ceilingEmitted) return;
    const total = this.totalCostUsd();
    const byStage = this.totalsByStage();

    // Per-stage budgets (absolute USD): baseline × (1 + headroom × share)
    const headroom = V02_CEILING_MULTIPLIER - 1;
    const stageBudgets: Record<StageKey, number> = {
      stage1: V01_BASELINE_USD_P95, // v0.1 stages share the baseline 1.0×
      stage2: V01_BASELINE_USD_P95,
      author: V01_BASELINE_USD_P95 * (1 + headroom * V02_PARTITION.author),
      author_planner: V01_BASELINE_USD_P95 * (1 + headroom * V02_PARTITION.author),
      annotate: V01_BASELINE_USD_P95 * (1 + headroom * V02_PARTITION.annotate),
    };

    let breachedPartition: StageKey | undefined;
    for (const [stage, spent] of Object.entries(byStage) as Array<[StageKey, number]>) {
      const budget = stageBudgets[stage];
      if (budget === undefined) continue;
      if (spent > budget) {
        breachedPartition = stage;
        break;
      }
    }

    const breachedAggregate = total > V02_COST_CEILING_USD;
    if (!breachedAggregate && breachedPartition === undefined) return;

    try {
      await emitMetric(this.store, {
        event: 'cost_ceiling_hit',
        session_id: this.sessionId,
        cost_usd: total,
        ceiling_usd: V02_COST_CEILING_USD,
        baseline_usd: V01_BASELINE_USD_P95,
        multiplier: V02_CEILING_MULTIPLIER,
        ...(breachedPartition ? { breached_partition: breachedPartition } : {}),
        ...(breachedAggregate ? { breached: 'aggregate' } : {}),
      });
      this.ceilingEmitted = true;
    } catch {
      /* telemetry non-fatal */
    }
  }

  totalCostUsd(): number {
    return this.entries.reduce((sum, e) => sum + e.cost_usd, 0);
  }

  totalsByStage(): Partial<Record<StageKey, number>> {
    const out: Partial<Record<StageKey, number>> = {};
    for (const e of this.entries) {
      const stage = (e as { stage?: StageKey }).stage;
      if (!stage) continue;
      out[stage] = (out[stage] ?? 0) + e.cost_usd;
    }
    return out;
  }

  reset(): void {
    this.entries = [];
    this.ceilingEmitted = false;
  }

  getEntries(): readonly CostEntry[] {
    return this.entries;
  }
}
