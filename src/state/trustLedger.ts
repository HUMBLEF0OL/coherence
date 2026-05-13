/**
 * Personal trust ledger — per-developer, per-section accept/edit/revert history.
 *
 * v1.0 M0 foundation (TS-2). Stores at `.claude/coherence/trust-ledger.json`
 * (gitignored, per-developer). Survives plugin re-install (DD-118 file-only
 * design). LRU-capped at 200 events per section, sorted by `_ts`.
 *
 * Score is the DD-138 weighted accept-rate with 30-day half-life decay
 * (`ALPHA = 0.977`). Recompute lazily on read when summary is older than the
 * newest event timestamp.
 */
import { existsSync } from 'fs';
import path from 'path';
import type { StateStore } from './stateStore.js';
import { nowIsoUtc } from '../util/time.js';
import { emitMetric } from './metrics.js';
import { getIdentity } from './identity.js';

/**
 * In-process serialisation queue keyed by ledger path.
 *
 * The file-based LockManager is designed for cross-process locks and uses
 * O_EXCL + retry semantics that fail fast under in-process contention
 * (50 concurrent same-PID acquires all collide). For M-LEDGER-1's intent
 * (50 concurrent recordEvent calls inside one Node process produce a
 * consistent final state) we need an in-process mutex.
 *
 * The queue holds the "tail" promise for each ledger path. New work
 * chains itself onto the tail with `.then(work)`. Each path has its own
 * chain so unrelated ledgers don't serialise against each other.
 */
const ledgerQueues = new Map<string, Promise<unknown>>();

async function withLedgerLock<T>(ledgerFile: string, fn: () => Promise<T>): Promise<T> {
  const prev = ledgerQueues.get(ledgerFile) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  // `chained` is the promise stored in the map — capture the reference so
  // the cleanup branch below can compare object identity. The previous
  // version re-evaluated `prev.then(...)` which produces a new promise each
  // time, so the cleanup branch never fired (the map would grow by 1 entry
  // per distinct ledger path until process exit).
  const chained = prev.then(() => next);
  ledgerQueues.set(ledgerFile, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (ledgerQueues.get(ledgerFile) === chained) {
      ledgerQueues.delete(ledgerFile);
    }
  }
}

export const LEDGER_FILE = 'trust-ledger.json';

const SCHEMA_VERSION = 3;
const ALPHA = 0.977;           // DD-138 30-day half-life
const DENOM_EPSILON = 0.001;   // numerical guard
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS_PER_SECTION = 200;

export type TrustEventKind = 'accept' | 'edit' | 'revert';
export type AutoLandKind = 'annotate' | 'skill' | 'agent' | 'slash_command';

export interface TrustEvent {
  _ts: string;
  weight: -1 | 0 | 1;
  kind: TrustEventKind;
}

export interface SectionSummary {
  score: number;
  as_of: string;
  event_count: number;
}

export interface TrustLedger {
  schema_version: 3;
  events: Record<string, TrustEvent[]>;
  summary: Record<string, SectionSummary>;
  promoted_at: string | null;
  promote_hint_emitted_at: string | null;
  auto_land_kinds: AutoLandKind[];
}

export interface PromoteEligibility {
  eligible: boolean;
  conditions_met: { score: boolean; sections: boolean; days: boolean };
  hint_emitted: boolean;
}

export function emptyLedger(): TrustLedger {
  return {
    schema_version: SCHEMA_VERSION,
    events: {},
    summary: {},
    promoted_at: null,
    promote_hint_emitted_at: null,
    auto_land_kinds: [],
  };
}

/**
 * Compute the DD-138 trust score for one section's events.
 *
 * Numerator weights: accept=+1, revert=-1, edit=0.
 * Denominator weights: accept=1, revert=1, edit=0.5.
 * Each event is multiplied by ALPHA^ageDays before sum.
 * Returns 0 if denominator below epsilon (no signal, or only very-old edits).
 */
export function computeSectionScore(events: TrustEvent[], nowMs: number = Date.now()): number {
  let numerator = 0;
  let denominator = 0;
  for (const ev of events) {
    // Edge #11 — clamp future timestamps to ageDays = 0
    const ageDays = Math.max(0, (nowMs - Date.parse(ev._ts)) / DAY_MS);
    const decay = Math.pow(ALPHA, ageDays);
    const numWeight = ev.kind === 'accept' ? 1 : ev.kind === 'revert' ? -1 : 0;
    const denWeight = ev.kind === 'edit' ? 0.5 : 1;
    numerator += numWeight * decay;
    denominator += denWeight * decay;
  }
  if (denominator < DENOM_EPSILON) return 0;
  const raw = numerator / denominator;
  // Clamp to [-1, 1] to satisfy schema bounds in edge numerical cases
  return Math.max(-1, Math.min(1, raw));
}

export function ledgerPath(store: StateStore): string {
  return path.join(store.coherencePath, LEDGER_FILE);
}

/**
 * Read the ledger, returning an empty one if the file is missing.
 * Schema validation throws via StateStore on corrupt input (file is quarantined).
 */
export async function readLedger(store: StateStore): Promise<TrustLedger> {
  const filePath = ledgerPath(store);
  if (!existsSync(filePath)) return emptyLedger();
  const data = await store.read<TrustLedger>(LEDGER_FILE);
  if (!data) {
    // StateStore either quarantined or file disappeared — return empty
    return emptyLedger();
  }
  // Edge #12 — schema_version mismatch is caught by AJV in StateStore.read
  // and the file is quarantined; data === null in that case (handled above).
  return data;
}

export async function writeLedger(store: StateStore, ledger: TrustLedger): Promise<void> {
  await store.write(LEDGER_FILE, ledger);
}

/**
 * Append an event, LRU-trim to 200 (sorted by `_ts`), recompute summary, persist.
 * Emits `proposal_<kind>_recorded` telemetry event (FR-TELEMETRY-1).
 */
export async function recordEvent(
  store: StateStore,
  sectionRef: string,
  kind: TrustEventKind,
  sessionId: string,
): Promise<void> {
  const lp = ledgerPath(store);
  // M-LEDGER-1: serialise the entire read-modify-write under an in-process
  // mutex so concurrent recordEvent calls cannot lose each other's events.
  await withLedgerLock(lp, async () => {
    const ledger = await readLedger(store);
    const _ts = nowIsoUtc();
    const weight: -1 | 0 | 1 = kind === 'accept' ? 1 : kind === 'revert' ? -1 : 0;

    const events = ledger.events[sectionRef] ?? [];
    events.push({ _ts, weight, kind });
    // Pass-1 amendment: sort ascending by `_ts` then trim to last MAX_EVENTS_PER_SECTION
    events.sort((a, b) => Date.parse(a._ts) - Date.parse(b._ts));
    ledger.events[sectionRef] =
      events.length > MAX_EVENTS_PER_SECTION ? events.slice(-MAX_EVENTS_PER_SECTION) : events;

    const trimmed = ledger.events[sectionRef];
    const score = computeSectionScore(trimmed);
    ledger.summary[sectionRef] = { score, as_of: _ts, event_count: trimmed.length };

    await writeLedger(store, ledger);

    const eventType = ('proposal_' + kind + '_recorded') as
      | 'proposal_accept_recorded'
      | 'proposal_edit_recorded'
      | 'proposal_revert_recorded';
    await emitMetric(store, {
      event: eventType,
      session_id: sessionId,
      sectionRef,
      weight,
      author_hash: getIdentity().hash,
    } as unknown as Parameters<typeof emitMetric>[1]);
  });
}

/**
 * Return the cached score for one section, recomputing if the summary is stale
 * relative to the newest event timestamp.
 */
export async function getSectionScore(
  store: StateStore,
  sectionRef: string,
): Promise<number> {
  const ledger = await readLedger(store);
  const events = ledger.events[sectionRef];
  if (!events || events.length === 0) return 0;
  const newestTs = Date.parse(events[events.length - 1]._ts);
  const summary = ledger.summary[sectionRef];
  if (summary && Date.parse(summary.as_of) >= newestTs) return summary.score;
  // Stale — recompute. The write-back happens under the trust-ledger lock so
  // a concurrent recordEvent does not lose the freshly computed summary.
  const fresh = computeSectionScore(events);
  try {
    await withLedgerLock(ledgerPath(store), async () => {
      const latest = await readLedger(store);
      latest.summary[sectionRef] = {
        score: fresh,
        as_of: nowIsoUtc(),
        event_count: (latest.events[sectionRef] ?? events).length,
      };
      await writeLedger(store, latest);
    });
  } catch {
    /* best-effort cache write */
  }
  return fresh;
}

/**
 * FR-TRUST-4 promote eligibility — THREE independent conditions:
 *   (a) score:    at least one section with score >= 0.85
 *   (b) sections: >= 5 distinct sectionRefs with score > 0
 *   (c) days:     ledger spans >= 30 days from earliest event
 * Returns whether the hint is already emitted (one-shot, FR-TRUST-1).
 */
export async function checkPromoteEligibility(store: StateStore): Promise<PromoteEligibility> {
  const ledger = await readLedger(store);
  const summaries = Object.values(ledger.summary);
  const score = summaries.some((s) => s.score >= 0.85);
  const sections = summaries.filter((s) => s.score > 0.0).length >= 5;

  let earliestTs = Number.POSITIVE_INFINITY;
  for (const evs of Object.values(ledger.events)) {
    for (const ev of evs) {
      const t = Date.parse(ev._ts);
      if (t < earliestTs) earliestTs = t;
    }
  }
  const days =
    Number.isFinite(earliestTs) && Date.now() - earliestTs >= 30 * DAY_MS;

  return {
    eligible: score && sections && days && !ledger.promote_hint_emitted_at,
    conditions_met: { score, sections, days },
    hint_emitted: ledger.promote_hint_emitted_at !== null,
  };
}

/** Identify trust-ledger keys whose sectionRef no longer appears in section-index.json. */
export async function listOrphanedKeys(
  store: StateStore,
  knownRefs: ReadonlySet<string>,
): Promise<string[]> {
  const ledger = await readLedger(store);
  const orphans: string[] = [];
  for (const ref of Object.keys(ledger.events)) {
    if (!knownRefs.has(ref)) orphans.push(ref);
  }
  return orphans.sort();
}

/** Move events + summary from one sectionRef key to another. M-REPAIR-1. */
export async function reassociateKey(
  store: StateStore,
  oldRef: string,
  newRef: string,
): Promise<void> {
  await withLedgerLock(ledgerPath(store), async () => {
    const ledger = await readLedger(store);
    const events = ledger.events[oldRef];
    if (!events) return;
    ledger.events[newRef] = (ledger.events[newRef] ?? []).concat(events);
    ledger.events[newRef].sort((a, b) => Date.parse(a._ts) - Date.parse(b._ts));
    if (ledger.events[newRef].length > MAX_EVENTS_PER_SECTION) {
      ledger.events[newRef] = ledger.events[newRef].slice(-MAX_EVENTS_PER_SECTION);
    }
    const newest = ledger.events[newRef][ledger.events[newRef].length - 1]._ts;
    ledger.summary[newRef] = {
      score: computeSectionScore(ledger.events[newRef]),
      as_of: newest,
      event_count: ledger.events[newRef].length,
    };
    delete ledger.events[oldRef];
    delete ledger.summary[oldRef];
    await writeLedger(store, ledger);
  });
}

/** Bulk-remove orphaned sectionRef keys (whose refs aren't in the current index). */
export async function expireOrphans(
  store: StateStore,
  knownRefs: ReadonlySet<string>,
): Promise<string[]> {
  const removed: string[] = [];
  await withLedgerLock(ledgerPath(store), async () => {
    const ledger = await readLedger(store);
    for (const ref of Object.keys(ledger.events)) {
      if (!knownRefs.has(ref)) {
        delete ledger.events[ref];
        delete ledger.summary[ref];
        removed.push(ref);
      }
    }
    if (removed.length > 0) await writeLedger(store, ledger);
  });
  return removed.sort();
}

/** Convenience for the file-existence test (M0 step 7 — re-install survives). */
export function ledgerFileName(): string {
  return LEDGER_FILE;
}

export { ALPHA, DENOM_EPSILON, MAX_EVENTS_PER_SECTION };
