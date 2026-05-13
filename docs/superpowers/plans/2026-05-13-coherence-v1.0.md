# Coherence v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the trust + intelligence release — per-section trust ladder, cross-session learning, `asserts:` frontmatter, `/coherence:metrics`, deep `/coherence:audit`, and trust signals (cosign + SECURITY.md) — as `v1.0.0`.

**Architecture:** Five sequential milestones (M0→M4) on the `v0.4.0` substrate per DD-136 trust-first ordering. M0 establishes the trust ledger foundation. M1 layers per-section trust scoring + auto-apply gates. M2 ships the `asserts:` validation pipeline. M3 ships `/coherence:metrics` + `/coherence:audit --deep`. M4 ships cosign signing + `SECURITY.md` + `/coherence:repair` extensions. M4 may run in parallel with M2–M3 after M0–M1 complete.

**Tech Stack:** TypeScript, Node.js (≥20), Vitest, Zod (schema validation), fast-glob (existing v0.3 dependency), `claude-sonnet-4-5` (only for `/coherence:audit --deep`), `cosign` keyless via GitHub Actions OIDC (CI-only).

**Source corpus:** [v1.0 BRD-1..5](https://www.notion.so/BRD-Business-Requirements-Document-35f010d46a7081fcb465e052d62d6a3f) (27 FRs, 14 NFRs, 23 M-gates) · [TS-1..TS-8](https://www.notion.so/Technical-Specification-v1-0-35f010d46a70818f80bdda9289fc2f77) · [DD-131..DD-147](https://www.notion.so/Design-Decisions-35f010d46a708191947dfd1e188f89c3) with three audit-pass amendments applied.

**Architectural commitments (carry-forward from v0.3/v0.4):**
- DD-117 — No backend, ever. File-only in perpetuity.
- DD-118 — No legacy version support. v1.0 installs fresh. `.claude/coherence/` state preserved across re-install.
- DD-065 — Trust model: net-new files never auto-land without explicit acceptance. v1.0 amends but does not abandon this — destructive and frontmatter patches always require confirmation regardless of trust score.
- DD-130 — Autogen command stubs from `.claude-plugin/plugin.json#slashCommands` at build time.

---

## File structure

### New source files (15)

- `src/state/trustLedger.ts` — personal ledger read/write/score computation (TS-2)
- `src/state/teamAggregate.ts` — per-developer file management + aggregate compute (TS-3)
- `src/state/schemas/trust-ledger.schema.json` — personal ledger JSON schema
- `src/state/schemas/team-aggregate.schema.json` — per-developer file JSON schema
- `src/commands/trust.ts` — `/coherence:trust` subcommand dispatcher (TS-5)
- `src/commands/metrics.ts` — `/coherence:metrics` 5-section renderer (TS-5)
- `src/validation/assertions/index.ts` — assertion registry + dispatcher
- `src/validation/assertions/textPatterns.ts` — 5 text-pattern engine functions (TS-4)
- `src/validation/assertions/codebaseLinked.ts` — `symbol_exists` + `file_exists` (TS-4, fast-glob-based per audit-pass amendment)
- `src/validation/assertions/policy.ts` — block/warn policy enforcement (TS-4)
- `src/audit/tokenBudget.ts` — char-count-based token estimation (TS-6)
- `src/audit/sectionSymbolIndex.ts` — lazy-built symbol-to-sections index (TS-6)
- `src/audit/deepConsistency.ts` — `--deep` LLM call orchestration with flag-based cost gate (TS-6)
- `src/release/cosign.ts` — cosign keyless signing wrapper (TS-7)
- `prompts/v3/audit-consistency.md` — LLM prompt for cross-section consistency pass

### New non-source files (4)

- `SECURITY.md` (project root) — responsible disclosure (TS-7)
- `.github/workflows/release.yml` — cosign sign + .sig/.pem upload step (TS-7)
- `scripts/render-readme-verification.mjs` — generates README ## Verification block from `package.json#repository.url` (TS-7 audit pass 3)

### Modified files (12)

- `src/hooks/stop.ts` — record accept/revert/edit events via `trustLedger.recordEvent()`
- `src/hooks/userPromptSubmit.ts` — sentinel dispatch for `coherence:trust` + `coherence:metrics`
- `src/hooks/commandDispatch.ts` — route trust + metrics handlers
- `src/validation/apply.ts` — assertion pipeline integration after hallucination check
- `src/detection/parseAnchors.ts` — extend frontmatter parser for `asserts:` nested list
- `src/commands/repair.ts` — orphan trust-ledger key detection + `--reassociate <old> --to <new>` + `--expire-orphans` flags
- `src/commands/audit.ts` — token budget free tier + `--deep` flag dispatch
- `src/pipeline/stop.ts` — trust ladder gate (auto-apply modifying patches when score ≥ 0.85; destructive + frontmatter unchanged)
- `scripts/release-ga.mjs` — cosign sign step (CI-only or `--unsigned` local fallback) + `release-artifacts/<version>.sha256` generation
- `.claude-plugin/plugin.json` — `slashCommands` entries for `coherence:trust` + `coherence:metrics`; bump `version` to `1.0.0`
- `README.md` — `<!-- BEGIN: coherence-verification -->` / `<!-- END: coherence-verification -->` markers replaced by build script
- `.npmignore` — add `release-artifacts/`
- `.gitignore` — add `.claude/coherence/section-symbol-index.json`
- `package.json` — bump version to `1.0.0`, add `render-readme-verification` step to `build` script
- `src/state/init.ts` — bump `PLUGIN_VERSION` to `1.0.0`
- `src/state/schemas/cost-ledger.schema.json` — extend `stage.enum` with `audit_deep`

### New committed state files (per-team, gitignored personal)

- `coherence/trust/<author-hash>.json` (committed; one per active developer, created via `/coherence:trust sync`)
- `release-artifacts/cohrence-1.0.0.sha256` (committed)
- `.claude/coherence/trust-ledger.json` (gitignored; per-developer)
- `.claude/coherence/section-symbol-index.json` (gitignored; per-developer cache)

---

## Task 1: M0 — Trust Ledger Foundation

**Goal:** Build the personal trust ledger data layer: schema, atomic writes, LRU eviction (sorted by `_ts`), DD-138 score formula, score computation API. No business logic yet — pure data + math.

**Gates closed:** `M-LEDGER-1` (atomic writes), `M-LEDGER-3` (formula correctness within ±0.01).

**Files:**
- Create: `src/state/trustLedger.ts`
- Create: `src/state/schemas/trust-ledger.schema.json`
- Create: `tests/unit/state/trust-ledger.test.ts`
- Create: `tests/unit/state/trust-ledger-formula.test.ts`
- Modify: `.gitignore` — add `.claude/coherence/trust-ledger.json` is already covered by existing `.claude/coherence/*` patterns (verify)

---

- [ ] **Step 1: Write the Zod schema**

Create `src/state/schemas/trust-ledger.schema.json` mirroring the TS-2 schema. Top-level fields:

```typescript
// src/state/trustLedger.ts (alongside schema)
export const TrustLedgerSchema = z.object({
  schema_version: z.literal(3),
  events: z.record(z.string(), z.array(z.object({
    _ts: z.string().datetime({ offset: false }), // UTC ISO 8601 with Z
    weight: z.union([z.literal(1), z.literal(0), z.literal(-1)]),
    kind: z.enum(['accept', 'edit', 'revert']),
  }))),
  summary: z.record(z.string(), z.object({
    score: z.number().min(-1).max(1),
    as_of: z.string().datetime({ offset: false }),
    event_count: z.number().int().min(0).max(200),
  })),
  promoted_at: z.string().datetime({ offset: false }).nullable(),
  promote_hint_emitted_at: z.string().datetime({ offset: false }).nullable(),
  auto_land_kinds: z.array(z.enum(['annotate', 'skill', 'agent', 'slash_command'])),
});
```

- [ ] **Step 2: Implement the formula (`computeSectionScore`)**

```typescript
const ALPHA = 0.977; // 30-day half-life
const DENOM_EPSILON = 0.001;

function computeSectionScore(events: TrustEvent[]): number {
  const now = Date.now();
  let numerator = 0;
  let denominator = 0;
  for (const ev of events) {
    const ageDays = (now - Date.parse(ev._ts)) / (1000 * 60 * 60 * 24);
    const decay = Math.pow(ALPHA, ageDays);
    const numWeight = ev.kind === 'accept' ? 1 : ev.kind === 'revert' ? -1 : 0;
    const denWeight = ev.kind === 'edit' ? 0.5 : 1;
    numerator += numWeight * decay;
    denominator += denWeight * decay;
  }
  if (denominator < DENOM_EPSILON) return 0;
  return numerator / denominator;
}
```

- [ ] **Step 3: Implement atomic write helper + readLedger() with empty-ledger init**

Reuse existing v0.3 atomic-write helper from `src/state/stateStore.ts` (write-to-`.tmp` then `fs.rename`). Use `JSON.stringify(obj, null, 2)` for serialization (produces LF cross-platform per pass-2 amendment).

Implement `readLedger()` with empty-ledger initialization (FR-LEDGER-5 absent-file behavior):

```typescript
export async function readLedger(): Promise<TrustLedger> {
  const p = ledgerPath();
  if (!fs.existsSync(p)) {
    return {
      schema_version: 3,
      events: {},
      summary: {},
      promoted_at: null,
      promote_hint_emitted_at: null,
      auto_land_kinds: [],
    };
  }
  const raw = fs.readFileSync(p, 'utf8');
  return TrustLedgerSchema.parse(JSON.parse(raw)); // Zod throws actionable error on schema mismatch
}
```

- [ ] **Step 4: Implement `recordEvent()`**

```typescript
export async function recordEvent(
  sectionRef: string,
  kind: 'accept' | 'edit' | 'revert'
): Promise<void> {
  const ledger = await readLedger();
  const weight = kind === 'accept' ? 1 : kind === 'revert' ? -1 : 0;
  const _ts = new Date().toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
  ledger.events[sectionRef] = ledger.events[sectionRef] || [];
  ledger.events[sectionRef].push({ _ts, weight, kind });
  // LRU eviction (sorted by _ts per pass-1 amendment)
  ledger.events[sectionRef].sort((a, b) => Date.parse(a._ts) - Date.parse(b._ts));
  if (ledger.events[sectionRef].length > 200) {
    ledger.events[sectionRef] = ledger.events[sectionRef].slice(-200);
  }
  // Recompute summary
  const score = computeSectionScore(ledger.events[sectionRef]);
  ledger.summary[sectionRef] = {
    score,
    as_of: _ts,
    event_count: ledger.events[sectionRef].length,
  };
  await atomicWrite(ledgerPath(), ledger);
  // Emit FR-TELEMETRY-1 event
  emitMetricsEvent(`proposal_${kind}_recorded`, { section_ref: sectionRef, weight, author_hash: deriveAuthorHash() });
}
```

- [ ] **Step 5: Implement `getSectionScore()` with lazy recomputation**

```typescript
export async function getSectionScore(sectionRef: string): Promise<number> {
  const ledger = await readLedger();
  const events = ledger.events[sectionRef];
  if (!events || events.length === 0) return 0; // pass-1 amendment
  const summary = ledger.summary[sectionRef];
  if (!summary || Date.parse(summary.as_of) < Date.parse(events[events.length - 1]._ts)) {
    // Stale: recompute
    const score = computeSectionScore(events);
    ledger.summary[sectionRef] = { score, as_of: new Date().toISOString(), event_count: events.length };
    await atomicWrite(ledgerPath(), ledger);
    return score;
  }
  return summary.score;
}
```

- [ ] **Step 6: Implement `checkPromoteEligibility()`**

```typescript
export async function checkPromoteEligibility(): Promise<PromoteEligibility> {
  const ledger = await readLedger();
  // FR-TRUST-4 has THREE SEPARATE conditions:
  // (a) score: at least one section has score >= 0.85
  // (b) sections: >= 5 distinct sectionRefs with score > 0.0 (just positive, not >=0.85)
  // (c) days: ledger spans >= 30 days from earliest event
  const summaryEntries = Object.values(ledger.summary);
  const score = summaryEntries.some(s => s.score >= 0.85);
  const positiveScoreSections = summaryEntries.filter(s => s.score > 0.0);
  const sections = positiveScoreSections.length >= 5;
  let earliestTs = Number.POSITIVE_INFINITY;
  for (const evs of Object.values(ledger.events)) {
    for (const ev of evs) earliestTs = Math.min(earliestTs, Date.parse(ev._ts));
  }
  const days = Number.isFinite(earliestTs) && (Date.now() - earliestTs) >= 30 * 24 * 60 * 60 * 1000;
  return {
    eligible: score && sections && days && !ledger.promote_hint_emitted_at,
    conditions_met: { score, sections, days },
    hint_emitted: ledger.promote_hint_emitted_at !== null,
  };
}
```

- [ ] **Step 7: Write unit tests**

`tests/unit/state/trust-ledger-formula.test.ts`:
- 1 accept (age 0) → score = 1.0
- 1 accept + 1 revert (both age 0) → score = 0.0
- 2 accepts + 1 edit (age 0) → score = 0.8 (2.0 / 2.5)
- 1 accept (age 30 days, decay ≈ 0.5) → score = 1.0 (decay applies equally to num and denom)
- Empty events → score = 0.0 (denominator guard)
- All events age 5 years → score = 0.0 (denominator < 0.001 guard)

`tests/unit/state/trust-ledger.test.ts`:
- Atomic write: 50 concurrent `recordEvent` calls produce consistent final state (M-LEDGER-1)
- LRU eviction: 250 events → 200 kept, oldest 50 discarded (verify sorted by `_ts`)
- Re-install survives: ledger preserved when `.claude/coherence/trust-ledger.json` exists at fresh plugin install

- [ ] **Step 8: Verify performance bound (NFR-PERF-N8)**

Add a perf test that simulates 100 affected sections × `recordEvent`. Assert wall-clock < 20 ms p95. If not achievable, document baseline and consider deferring optimization to v1.1.

---

## Task 2: M1 — Trust Ladder

**Goal:** Layer trust ladder behavior on top of M0: trust-score auto-apply gate for modifying patches; one-time promote hint with explicit `/coherence:trust --promote`; net-new file gate relaxation by kind.

**Gates closed:** `M-TRUST-1`, `M-TRUST-2`, `M-TRUST-3`, `M-TRUST-4`, `M-PERF-N6-EXT`.

**Depends on:** M0 complete.

**Files:**
- Create: `src/commands/trust.ts`
- Modify: `src/pipeline/stop.ts` — trust gate for modifying patches
- Modify: `src/hooks/commandDispatch.ts` — route `coherence:trust`
- Modify: `src/hooks/userPromptSubmit.ts` — sentinel detection for `coherence:trust`
- Modify: `.claude-plugin/plugin.json` — add `coherence:trust` slashCommands entry
- Create: `tests/integration/trust-ladder.test.ts`
- Create: `tests/integration/trust-promote.test.ts`

---

- [ ] **Step 1: Implement `/coherence:trust` dispatcher**

```typescript
export async function handleTrustCommand(argv: string[]): Promise<string> {
  if (argv[0] === 'sync') return await handleSync();
  if (argv.includes('--promote')) return await handlePromote(argv);
  if (argv.includes('--prune-stale')) return await handlePruneStale(argv);
  return await handleStatus(); // default
}
```

- [ ] **Step 2: Implement `teamAggregate.computeAggregate()` + `--status` renderer**

First, build `src/state/teamAggregate.ts` with `computeAggregate()` and `deriveAuthorHash()` so both `--status` and `/coherence:metrics` (Task 4) reuse it:

```typescript
// src/state/teamAggregate.ts
const projectRoot = () => path.dirname(path.dirname(getCoherenceDir()));
const STALENESS_MS = 180 * 24 * 60 * 60 * 1000;

export function deriveAuthorHash(): string {
  const email = execSync('git config user.email', { encoding: 'utf8' }).trim().toLowerCase();
  if (!email.includes('@')) throw new Error('git config user.email is malformed (no @)');
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 12);
}

export async function computeAggregate(): Promise<Map<string, AggregateEntry>> {
  const dir = path.join(projectRoot(), 'coherence', 'trust');
  if (!fs.existsSync(dir)) return new Map();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const now = Date.now();
  const activeContributions: Array<{ author_hash: string; scores: Record<string, { score: number; as_of: string }> }> = [];
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (now - Date.parse(data.last_synced_at) > STALENESS_MS) continue; // FR-LEDGER-3
    activeContributions.push({ author_hash: data.author_hash, scores: data.scores });
  }
  const bySection = new Map<string, AggregateEntry>();
  // Collect all sectionRefs across active files
  const allRefs = new Set<string>();
  for (const c of activeContributions) for (const ref of Object.keys(c.scores)) allRefs.add(ref);
  for (const ref of allRefs) {
    const contributingScores = activeContributions.filter(c => c.scores[ref]).map(c => c.scores[ref].score);
    const aggregate_score = contributingScores.reduce((a, b) => a + b, 0) / contributingScores.length;
    const contested = contributingScores.length >= 2 && Math.abs(aggregate_score) < 0.2; // FR-LEDGER-4 pass-3
    bySection.set(ref, { aggregate_score, contributing_authors: contributingScores.length, contested });
  }
  return bySection;
}
```

Then render the `--status` Markdown report per TS-5 using both personal ledger + team aggregate. The 5 sections: (a) current trust state, (b) top 5 high personal scores, (c) top 5 low personal scores, (d) team aggregate summary (active developer count, contested count), (e) promote eligibility check.

- [ ] **Step 3: Implement `sync` subcommand (TS-3)**

```typescript
async function handleSync(): Promise<string> {
  const authorHash = deriveAuthorHash();
  if (!authorHash) throw new Error('git config user.email is required for trust sync');
  const ledger = await readLedger();
  const scores: Record<string, { score: number; as_of: string }> = {};
  for (const [ref, summary] of Object.entries(ledger.summary)) {
    scores[ref] = { score: summary.score, as_of: summary.as_of };
  }
  const teamFile = {
    schema_version: 3,
    author_hash: authorHash,
    last_synced_at: new Date().toISOString(),
    scores,
  };
  const dir = path.join(projectRoot(), 'coherence', 'trust');
  await fs.promises.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${authorHash}.json`);
  await atomicWrite(filePath, teamFile); // JSON.stringify(obj, null, 2) per pass-2 amendment
  return `Synced ${Object.keys(scores).length} sections to coherence/trust/${authorHash}.json`;
}
```

- [ ] **Step 4: Implement `--promote --auto-land <kinds>`**

```typescript
async function handlePromote(argv: string[]): Promise<string> {
  const eligibility = await checkPromoteEligibility();
  if (!eligibility.eligible) {
    return `Not eligible: score=${eligibility.conditions_met.score}, sections=${eligibility.conditions_met.sections}, days=${eligibility.conditions_met.days}`;
  }
  const kindsArg = getFlagValue(argv, '--auto-land') || 'annotate';
  const kinds = kindsArg.split(',').filter(k => ['annotate', 'skill', 'agent', 'slash_command'].includes(k));
  const ledger = await readLedger();
  ledger.promoted_at = new Date().toISOString();
  ledger.auto_land_kinds = kinds;
  await atomicWrite(ledgerPath(), ledger);
  await appendCoherenceLog(`Trust promoted: auto-land kinds = [${kinds.join(', ')}]`);
  return `Promoted. Auto-land enabled for: ${kinds.join(', ')}.`;
}
```

- [ ] **Step 5: Wire trust gate into stop pipeline**

```typescript
// src/pipeline/stop.ts amendment
async function shouldAutoApplyPatch(patch: Patch): Promise<boolean> {
  // v0.2 Graduated mode + v1.0 trust ladder
  if (mode !== 'graduated') return false;
  if (patch.classification === 'destructive' || patch.classification === 'frontmatter') {
    return false; // ALWAYS require confirmation (DD-131 pass-1 amendment)
  }
  if (patch.classification === 'additive') return true; // v0.2 behavior
  if (patch.classification === 'modifying') {
    const score = await getSectionScore(patch.sectionRef);
    return score >= 0.85; // FR-TRUST-2
  }
  return false;
}
```

- [ ] **Step 6: Emit one-time promote hint at SessionStart**

```typescript
// src/hooks/sessionStart.ts amendment
const eligibility = await checkPromoteEligibility();
if (eligibility.eligible && !eligibility.hint_emitted) {
  console.error('coherence: Your trust score qualifies for auto-land. Run /coherence:trust --promote to activate.');
  const ledger = await readLedger();
  ledger.promote_hint_emitted_at = new Date().toISOString();
  await atomicWrite(ledgerPath(), ledger);
}
```

- [ ] **Step 7: Net-new file gate relaxation**

Modify `src/proposals/acceptPropose.ts` (existing v0.2 quarantine boundary): after the existing acceptance check, if the proposal kind is in `ledger.auto_land_kinds`, skip the explicit user-typed acceptance requirement. Existing kinds outside `auto_land_kinds` still require explicit accept (DD-065 preserved).

- [ ] **Step 8: Register command in manifest**

`.claude-plugin/plugin.json#slashCommands` append:
```json
{ "name": "coherence:trust", "description": "View/manage trust state and team sync. Subcommands: --status (default), sync, --promote --auto-land <kinds>, --prune-stale." }
```

Confirm `npm run build` regenerates `commands/trust.md` via DD-130 autogen.

- [ ] **Step 9: Integration tests**

`tests/integration/trust-ladder.test.ts`:
- Section with score 0.9 + modifying patch → auto-applied
- Section with score 0.9 + destructive patch → requires confirmation (M-TRUST-3)
- Section with score 0.9 + frontmatter patch → requires confirmation
- Section with score 0.4 + modifying patch → requires confirmation

`tests/integration/trust-promote.test.ts`:
- Synthetic ledger meeting all 3 threshold conditions → hint emitted exactly once (M-TRUST-1)
- After --promote, auto_land_kinds persists across sessions (M-TRUST-2)
- --auto-land annotate alone → skill kind still requires accept (M-TRUST-4)
- --auto-land annotate,skill → both auto-land

`tests/integration/team-aggregate.test.ts`:
- M-LEDGER-2 staleness: synthetic `coherence/trust/` with 3 files — synced 179 days ago (active), 181 days ago (stale-excluded), 366 days ago (prune candidate). Assert `computeAggregate()` ignores the 181+ day file. Assert `/coherence:trust --prune-stale --yes` removes only the 366+ day file. Returning developer's next sync reactivates their entry.
- M-LEDGER-4 conflict: 3 developers, same section, scores [+0.9, +0.8, -0.85]. Assert `aggregate_score ≈ 0.28`, `contributing_authors = 3`, `contested = false` (|0.28| ≥ 0.2). Modify Dev C score to -0.95 → aggregate ≈ 0.25 still not contested. Modify Dev A → score 0.0 → aggregate ≈ -0.05 → contested = true.

`tests/perf/trust-status.test.ts` (NFR-PERF-N6-EXT):
- Synthetic workload: 90-day metrics.jsonl + 1000-section ledger + 20 active team developer files. Assert `/coherence:trust --status` renders < 200 ms p95 over 100 iterations.

---

## Task 3: M2 — `asserts:` Validation Pipeline

**Goal:** Build the assertion engine: frontmatter parser extension, 5 text-pattern engines, 2 codebase-linked engines (fast-glob-based per audit amendment), per-assertion block/warn policy.

**Gates closed:** `M-ASSERTS-1`, `M-ASSERTS-2`, `M-ASSERTS-3`, `M-ASSERTS-4`.

**Depends on:** M0 complete (no dependency on M1).

**Files:**
- Create: `src/validation/assertions/{index,textPatterns,codebaseLinked,policy}.ts`
- Modify: `src/validation/apply.ts` — pipeline integration
- Modify: `src/detection/parseAnchors.ts` — frontmatter extension
- Create: `tests/unit/validation/assertions-text.test.ts`
- Create: `tests/unit/validation/assertions-codebase.test.ts`
- Create: `tests/integration/asserts-pipeline.test.ts`

---

- [ ] **Step 1: Extend frontmatter parser**

Modify `parseAnchors.ts` to read `asserts:` as `Array<{ type: string; param?: string; policy?: 'block' | 'warn' }>`. The existing `js-yaml` parser supports this natively. Validate each entry: `type` required string; `param` optional string; `policy` optional enum default `warn`.

Apply `slice(0, 10)` cap with stderr warning for excess (FR-ASSERTS-1 amendment). One combined warning line per section per session: `coherence: <count> assertion(s) in section <ref> ignored: <reasons>`.

- [ ] **Step 2: Implement text-pattern assertions**

`src/validation/assertions/textPatterns.ts`:

```typescript
export const textPatterns = {
  has_example: (section) => ({
    passed: /```[\s\S]*?```/.test(section.content),
    message: 'section has no code example',
  }),
  no_placeholder_links: (section) => ({
    passed: !/\[[^\]]+\]\((TODO|#|)\)/.test(section.content),
    message: 'section contains placeholder links',
  }),
  max_words: (section, param) => {
    const words = section.content.trim().split(/\s+/).length;
    const max = parseInt(param);
    return { passed: words <= max, message: `section has ${words} words (max ${max})` };
  },
  min_words: (section, param) => {
    const words = section.content.trim().split(/\s+/).length;
    const min = parseInt(param);
    return { passed: words >= min, message: `section has ${words} words (min ${min})` };
  },
  no_todo_comments: (section) => ({
    passed: !/<!--\s*(TODO|FIXME)/i.test(section.content),
    message: 'section contains <!-- TODO or <!-- FIXME marker',
  }),
};
```

- [ ] **Step 3: Implement codebase-linked assertions (fast-glob, not ripgrep)**

`src/validation/assertions/codebaseLinked.ts`:

```typescript
import fastGlob from 'fast-glob';
import { getCoherenceDir } from '../../state/init';
import { detectProjectLanguage } from '../hallucination';

const SUPPORTED_LANGS = ['typescript', 'javascript', 'python', 'go', 'rust'];
const projectRoot = () => path.dirname(path.dirname(getCoherenceDir()));

// Per-session file-list cache (pass-2 amendment)
const fileListCache = new Map<string, string[]>();

export async function symbol_exists(_section, param) {
  // Parse "symbol:language" — split on LAST colon
  const lastColon = param.lastIndexOf(':');
  let symbol: string;
  let lang: string;
  if (lastColon !== -1 && SUPPORTED_LANGS.includes(param.slice(lastColon + 1))) {
    symbol = param.slice(0, lastColon);
    lang = param.slice(lastColon + 1);
  } else {
    symbol = param;
    lang = detectProjectLanguage();
  }
  const globs = langGlobs(lang);
  let files = fileListCache.get(lang);
  if (!files) {
    files = await fastGlob(globs, { cwd: projectRoot(), absolute: true });
    fileListCache.set(lang, files);
  }
  // Parallel batched reads with short-circuit (pass-2 amendment)
  for (let i = 0; i < files.length; i += 10) {
    const batch = files.slice(i, i + 10);
    const results = await Promise.all(batch.map(f => fs.promises.readFile(f, 'utf8').then(c => c.includes(symbol))));
    if (results.some(r => r)) return { passed: true };
  }
  return { passed: false, message: `symbol '${symbol}' not found in ${lang} source files` };
}

export async function file_exists(_section, param) {
  try {
    await fs.promises.stat(path.resolve(projectRoot(), param));
    return { passed: true };
  } catch (e) {
    return { passed: false, message: `file '${param}' does not exist` };
  }
}
```

- [ ] **Step 4: Implement assertion registry**

`src/validation/assertions/index.ts`:

```typescript
const REGISTRY = {
  has_example: textPatterns.has_example,
  no_placeholder_links: textPatterns.no_placeholder_links,
  max_words: textPatterns.max_words,
  min_words: textPatterns.min_words,
  no_todo_comments: textPatterns.no_todo_comments,
  symbol_exists: codebaseLinked.symbol_exists,
  file_exists: codebaseLinked.file_exists,
};

export async function runAssertion(section, assertion) {
  const fn = REGISTRY[assertion.type];
  if (!fn) {
    // Log + ignore (FR-ASSERTS-5)
    return { ignored: true, reason: `unknown type: ${assertion.type}` };
  }
  const result = await fn(section, assertion.param);
  return { ...result, policy: assertion.policy || 'warn' };
}
```

- [ ] **Step 5: Pipeline integration**

`src/validation/apply.ts` amendment — insert after hallucination check, before patch apply:

```typescript
for (const section of patch.affectedSections) {
  const asserts = (section.frontmatter.asserts || []).slice(0, 10);
  const results = [];
  for (const a of asserts) results.push(await runAssertion(section, a));
  const violations = results.filter(r => !r.ignored && !r.passed);
  const blocks = violations.filter(v => v.policy === 'block');
  if (blocks.length > 0) {
    return { rejected: true, reason: blocks.map(b => b.message).join('; ') };
  }
  const warns = violations.filter(v => v.policy === 'warn');
  if (warns.length > 0) {
    patch.warnings = (patch.warnings || []).concat(warns.map(w => `[assertion warning] ${w.message}`));
  }
}
```

- [ ] **Step 6: Unit tests**

`tests/unit/validation/assertions-text.test.ts`:
- has_example: section with ```` ```ts ```` passes; section with prose only fails
- no_placeholder_links: section with `[text](TODO)` fails; section with `[text](#section)` passes
- max_words: 50-word section with max=50 passes; max=49 fails
- min_words: same boundary cases
- no_todo_comments: section with `<!-- TODO` fails; case-insensitive match for `FIXME`

`tests/unit/validation/assertions-codebase.test.ts`:
- symbol_exists: with synthetic TS fixture containing `function myFunc`, assertion passes; absent symbol fails
- symbol_exists with language suffix: `myPyFunc:python` checks `*.py` only
- file_exists: existing path passes; ENOENT fails

`tests/integration/asserts-pipeline.test.ts`:
- Mixed policy section (one block + one warn) — block-violation rejects patch
- One warn-only violation — patch proceeds with warning attached to review UX
- Max 10 enforced — 11th assertion ignored with stderr warning (M-ASSERTS-3)

---

## Task 4: M3 — Metrics + Deep Audit

**Goal:** Ship `/coherence:metrics` 5-section renderer and `/coherence:audit --deep` LLM cross-section consistency pass with two-step flag confirmation (no TTY).

**Gates closed:** `M-METRICS-1`, `M-METRICS-2`, `M-AUDIT-1`, `M-AUDIT-2`, `M-AUDIT-3`.

**Depends on:** M0 (trust ledger), M1 (team aggregate via `/coherence:trust sync`), M2 optional.

**Files:**
- Create: `src/commands/metrics.ts`
- Create: `src/audit/{tokenBudget,sectionSymbolIndex,deepConsistency}.ts`
- Create: `prompts/v3/audit-consistency.md`
- Modify: `src/commands/audit.ts` — free tier + `--deep` dispatch
- Modify: `src/state/schemas/cost-ledger.schema.json` — add `audit_deep` to enum
- Modify: `.claude-plugin/plugin.json` — add `coherence:metrics`
- Create: `tests/integration/metrics-renderer.test.ts`
- Create: `tests/integration/audit-free.test.ts`
- Create: `tests/integration/audit-deep.test.ts`

---

- [ ] **Step 1: Implement `/coherence:metrics` 5-section renderer**

```typescript
export async function handleMetricsCommand(argv: string[]): Promise<string> {
  const since = getFlagValue(argv, '--since');
  const out = getFlagValue(argv, '--out');
  const revertThreshold = parseInt(getFlagValue(argv, '--revert-threshold') || '20'); // PERCENT (pass-1 amendment)
  if (revertThreshold < 0 || revertThreshold > 100) {
    throw new Error('--revert-threshold must be an integer in [0, 100]');
  }
  const sections = [
    await renderSummary(since),
    await renderTopDrifting(since),
    await renderTrustScores(),
    await renderCostTrend(since),
    await renderRevertHotspots(revertThreshold, since),
  ];
  const report = sections.join('\n\n---\n\n');
  if (out) await writeWithSandbox(out, report); // NFR-PATH-SANDBOX
  return report;
}
```

- [ ] **Step 2: Implement section (1) `renderSummary`**

Reads `metrics.jsonl` via the existing v0.3 streaming reader. Counts events by `event_type` for two windows: all-time and `now - 30 days`. Applies optional `--since` filter to both windows. Renders 2-column Markdown table (header | values). Event types counted: `proposal_accept_recorded`, `proposal_revert_recorded`, `proposal_edit_recorded` (v1.0 new from FR-TELEMETRY-1) + `patch_applied`, `patch_reverted` (v0.1 carries).

- [ ] **Step 3: Implement section (2) `renderTopDrifting`**

Reads `coherence-log.md` entries (existing v0.1 audit log format). Groups by `sectionRef`, counts applied patches, sorts desc, takes top 10. For each section, calls `teamAggregate.computeAggregate()` (from Task 2 Step 2); if entry is `contested`, prepends `⚠ ` to the row. Empty state: "No drift data yet."

- [ ] **Step 4: Implement section (3) `renderTrustScores`**

Reads `trust-ledger.json#summary`, sorts by score asc + desc. Renders top 10 highest + top 10 lowest as Markdown table with columns: `sectionRef | personal score | team aggregate (active contributors, as_of)`. The team aggregate column shows the freshest `as_of` across contributing authors so reviewers can see recency. Empty state: "No trust data yet — run more sessions to accumulate metrics."

- [ ] **Step 5: Implement section (4) `renderCostTrend` (Unicode sparkline)**

```typescript
function renderSparkline(daily: number[]): string {
  if (daily.length < 3) return '< 3 sessions — no trend yet.'; // (single-point case implicitly handled here)
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const max = Math.max(...daily);
  const min = Math.min(...daily);
  if (max === 0) return '▁'.repeat(30); // all-zero edge case
  if (max === min) return '▄'.repeat(daily.length); // max==min edge case
  return daily.map(v => blocks[Math.floor(((v - min) / (max - min)) * 7)]).join('');
}
```

Reads `cost-ledger.json` for last 30 days, sums per-day cost, passes to `renderSparkline()`.

- [ ] **Step 6: Implement section (5) `renderRevertHotspots`**

For each section appearing in `metrics.jsonl`, count `proposal_accept_recorded` + `proposal_revert_recorded` + `proposal_edit_recorded`. Filter sections with total ≥ 5. Compute `revertRate = reverts / (accepts + reverts + edits)` per FR-METRICS-3. Filter `revertRate * 100 >= revertThreshold` (user-supplied or default 20). Sort desc, render table with columns: `sectionRef | revert rate | event counts`. Empty state: "No revert hotspots."

- [ ] **Step 7: Wire `--out` write with sandbox**

Reuse `writeWithSandbox()` helper from v0.4 `/coherence:export-metrics --out` (FR-SANDBOX-1 carry, NFR-PATH-SANDBOX). Refuses paths outside `projectRoot()` unless `--allow-out-of-tree` flag is passed (stderr warning on bypass).

- [ ] **Step 8: Implement free-tier audit (token budget)**

`src/audit/tokenBudget.ts`:

```typescript
export async function tokenBudgetReport(): Promise<string> {
  const sectionIndex = await readSectionIndex();
  const rows = sectionIndex.map(s => {
    const tokens = Math.ceil(s.content_length_chars / 4);
    let tier: string;
    if (tokens < 2000) tier = 'Normal';
    else if (tokens <= 5000) tier = '⚠ Large';
    else tier = '❌ Bloated (consider splitting)';
    return { sectionRef: s.sectionRef, tokens, tier };
  });
  return renderTokenBudgetMarkdown(rows);
}
```

- [ ] **Step 9: Implement section-symbol-index cache**

`src/audit/sectionSymbolIndex.ts`:

```typescript
export async function loadOrBuildIndex(): Promise<SymbolIndex> {
  const indexHash = await hashFile('.claude/coherence/section-index.json');
  const registryFiles = fs.readdirSync('src/validation/registries/').sort(); // pass-2 amendment
  const registryHash = await hashConcatFiles(registryFiles.map(f => `src/validation/registries/${f}`));
  const cachePath = '.claude/coherence/section-symbol-index.json';
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (cached.source_index_hash === indexHash && cached.registry_hash === registryHash) {
      return cached;
    }
  }
  // Rebuild
  const sectionIndex = await readSectionIndex();
  const symbols: Record<string, string[]> = {};
  // ... grep each section.content for registry symbols
  const fresh = { schema_version: 1, source_index_hash: indexHash, registry_hash: registryHash, built_at: new Date().toISOString(), symbols };
  await atomicWrite(cachePath, fresh);
  return fresh;
}
```

- [ ] **Step 10: Implement `--deep` consistency pass with flag-based confirmation**

`src/audit/deepConsistency.ts`:

```typescript
export async function handleDeepAudit(argv: string[]): Promise<string> {
  const confirm = getFlagValue(argv, '--confirm-deep');
  const noConfirm = argv.includes('--no-confirm') && process.env.CI === 'true';
  const sectionsFilter = getFlagValue(argv, '--sections');
  const index = await loadOrBuildIndex();
  const pairs = computeSymbolSharingPairs(index, sectionsFilter).slice(0, 10);
  const signature = computeSignature(pairs).slice(0, 12); // pass-2 amendment
  if (!confirm && !noConfirm) {
    return renderEstimate(pairs, signature); // first call: print estimate + signature
  }
  if (confirm && confirm !== signature) {
    throw new Error('pair list changed; re-run --deep to get fresh estimate');
  }
  // Run LLM call
  return await runConsistencyLLM(pairs);
}
```

`prompts/v3/audit-consistency.md` (new): structured prompt that takes pair of sections and outputs `{ consistent: boolean, issues?: [...] }` JSON.

- [ ] **Step 11: Extend cost-ledger schema**

`src/state/schemas/cost-ledger.schema.json` — add `audit_deep` to `properties.entries.items.properties.stage.enum`.

- [ ] **Step 12: Register `coherence:metrics` in manifest**

`.claude-plugin/plugin.json#slashCommands` append:
```json
{ "name": "coherence:metrics", "description": "Render quality metrics report: summary, top drifting sections, trust scores, cost trend, revert hotspots." }
```

- [ ] **Step 13: Tests**

`tests/integration/metrics-renderer.test.ts`:
- Synthetic 90-day `metrics.jsonl` + 1000-section ledger + 20 team files → renders all 5 sections (M-METRICS-1)
- Performance: < 200 ms p95 (M-METRICS-2)
- Empty ledger → "No trust data yet" message
- `--since 2026-01-01` filters correctly
- `--revert-threshold 10` finds more hotspots than default 20

`tests/integration/audit-free.test.ts`:
- Token budget tiers (Normal/Large/Bloated) classified correctly (M-AUDIT-1)
- Performance: < 100 ms p95 (NFR-PERF-N7)

`tests/perf/audit-free.test.ts`:
- Synthetic 1000-section index. Assert `/coherence:audit` (free tier, no `--deep`) renders < 100 ms p95 over 100 iterations (NFR-PERF-N7).

`tests/integration/audit-deep.test.ts`:
- First call (no `--confirm-deep`) prints estimate + signature, no LLM call
- Second call with correct signature → LLM call (replayed via cassette)
- Stale signature → error
- > 10 candidate pairs → advise `--sections` narrowing
- `--no-confirm` in CI env → proceeds; outside CI → ignored
- Cache hit on second invocation (M-AUDIT-3)

---

## Task 5: M4 — Trust Signals + Repair Extensions

**Goal:** cosign keyless signing via GitHub Actions OIDC; `SECURITY.md` + README `## Verification` section; `/coherence:repair` orphan trust-ledger key handling with `--reassociate <old> --to <new>` and `--expire-orphans`.

**Gates closed:** `M-SIGN-1`, `M-SIGN-2`, `M-SIGN-3`, `M-REPAIR-1`, `M-LEGACY-1` (extension).

**Depends on:** M0 complete (for repair). M2/M3 can run in parallel.

**Files:**
- Create: `src/release/cosign.ts`
- Create: `SECURITY.md`
- Create: `.github/workflows/release.yml`
- Create: `scripts/render-readme-verification.mjs`
- Modify: `scripts/release-ga.mjs` — sign step + `release-artifacts/<version>.sha256` generation
- Modify: `src/commands/repair.ts` — orphan trust-ledger key handling
- Modify: `README.md` — add `<!-- BEGIN: coherence-verification -->` markers
- Modify: `.npmignore` — exclude `release-artifacts/`
- Modify: `package.json` — `build` script runs `render-readme-verification`
- Create: `tests/static-analysis/security-md.test.ts`
- Create: `tests/static-analysis/readme-verification.test.ts`
- Create: `tests/integration/repair-trust-orphans.test.ts`
- Create: `tests/ship/signing-fail-closed.test.ts`

---

- [ ] **Step 1: Create `SECURITY.md`**

Required headings (M-SIGN-3 amendment): `## Reporting a Vulnerability`, `## Disclosure Policy`, `## Supported Versions`. Include GitHub Security Advisories URL as fallback path.

- [ ] **Step 2: Implement `render-readme-verification.mjs`**

Reads `package.json#repository.url`, derives `--certificate-identity-regexp`, replaces content between `<!-- BEGIN: coherence-verification -->` and `<!-- END: coherence-verification -->` markers in `README.md`.

- [ ] **Step 3: Add markers to README.md**

Insert `## Verification` section in README with markers and initial content. Subsequent `npm run build` regenerates.

- [ ] **Step 4: Implement `release-ga.mjs` sign step**

```javascript
async function runSignStep() {
  const isCI = process.env.GITHUB_ACTIONS === 'true';
  const unsigned = process.argv.includes('--unsigned');
  if (!isCI && !unsigned) {
    console.error('cosign signing requires GitHub Actions. Pass --unsigned to bypass (produces -UNSIGNED.tgz).');
    process.exit(1);
  }
  if (!isCI && unsigned) {
    fs.renameSync('cohrence-1.0.0.tgz', 'cohrence-1.0.0-UNSIGNED.tgz');
    console.error('WARNING: Unsigned release artifact — do not distribute publicly');
    return;
  }
  // CI path
  await execAsync('cosign sign-blob --yes cohrence-1.0.0.tgz --output-signature cohrence-1.0.0.tgz.sig --output-certificate cohrence-1.0.0.tgz.pem');
}
```

Also generate `release-artifacts/cohrence-<version>.sha256` after `npm pack` step.

- [ ] **Step 5: Create `.github/workflows/release.yml`**

Steps: checkout → setup-node → npm install → npm run build → npm test → npm pack → install cosign → run release-ga.mjs (which invokes signing) → `gh release create` with `.tgz`, `.sig`, `.pem`, `.sha256` attached.

Workflow permissions block (BOTH required):
```yaml
permissions:
  id-token: write   # cosign keyless OIDC (FR-SIGN-1)
  contents: write   # gh release create upload (FR-SIGN-3)
```

Without `contents: write`, the upload step fails with 403 even though signing succeeds.

- [ ] **Step 6: Extend `/coherence:repair` for trust orphans**

```typescript
// src/commands/repair.ts amendment
const reassociateOld = getFlagValue(argv, '--reassociate');
const reassociateNew = getFlagValue(argv, '--to');
const expireOrphans = argv.includes('--expire-orphans') || argv.includes('--auto-expire');

if (reassociateOld && !reassociateNew) throw new Error('--reassociate requires --to');
if (reassociateOld && reassociateNew) {
  await trustLedger.reassociateKey(reassociateOld, reassociateNew);
  await appendCoherenceLog(`Trust ledger reassociated: ${reassociateOld} → ${reassociateNew}`);
  return;
}
if (expireOrphans) {
  const removed = await trustLedger.expireOrphans();
  const refsPreview = removed.slice(0, 20).join(', ') + (removed.length > 20 ? ` … and ${removed.length - 20} more` : '');
  await appendCoherenceLog(`Trust orphans expired: ${removed.length} sectionRef(s) removed: ${refsPreview}`);
  return;
}

// Default repair: also list orphaned trust-ledger keys
const sectionIndex = await readSectionIndex();
const orphans = await trustLedger.listOrphanedKeys(sectionIndex);
if (orphans.length > 0) {
  console.log(`Orphaned trust-ledger entries (${orphans.length}):`);
  orphans.forEach((ref, i) => console.log(`  [${i + 1}] ${ref}`));
  console.log('Use --reassociate <oldRef> --to <newRef> or --expire-orphans to resolve.');
}
```

- [ ] **Step 7: Update `.npmignore`**

Add line `release-artifacts/`. Add to M-LEGACY-1 carry test that `npm pack --dry-run` output does not contain `release-artifacts/`.

- [ ] **Step 8: Static-analysis tests**

`tests/static-analysis/security-md.test.ts`:
- Assert SECURITY.md exists at project root
- Assert required headings present (M-SIGN-3)

`tests/static-analysis/readme-verification.test.ts`:
- Assert markers `<!-- BEGIN: coherence-verification -->` / `<!-- END: coherence-verification -->` exist
- Assert content between markers has cosign verify command and Rekor lookup
- Assert M6 gate names listed

`tests/ship/signing-fail-closed.test.ts`:
- Run `release-ga.mjs` without `GITHUB_ACTIONS` set and without `--unsigned` → exits non-zero
- Run with `--unsigned` → produces `-UNSIGNED.tgz`

`tests/integration/repair-trust-orphans.test.ts`:
- Synthetic ledger with sectionRef not in section-index → orphan detected
- `--reassociate old --to new` → key moved, log entry appended
- `--expire-orphans` → bulk delete, log entry with up to 20 refs + "… and N more"

---

## Task 6: Version bump + docs + final ship gate

**Goal:** Bump version to `1.0.0` across all 3 sources, update v1.0 docs set, run full test + gate suite, prepare release notes.

**Files:**
- Modify: `package.json` (version → 1.0.0)
- Modify: `.claude-plugin/plugin.json` (version → 1.0.0)
- Modify: `src/state/init.ts` (PLUGIN_VERSION → 1.0.0)
- Create: `docs/v1.0/CHANGELOG.md`
- Create: `docs/v1.0/commands.md`
- Create: `docs/v1.0/state-files.md`
- Create: `docs/v1.0/privacy.md`
- Create: `docs/v1.0/rollback.md`
- Create: `RELEASE_NOTES_v1.0.0.md`
- Modify: `README.md` (top-level — describe v1.0 in intro)

---

- [ ] **Step 1: Run `assertVersionSync('v1.0.0')`** — verify all 3 version sources agree.

- [ ] **Step 2: Run `npm run validate-plugin`** — verify manifest schema clean.

- [ ] **Step 3: Run `npm run gates`** — verify M-ARCH-1, M-PRIVACY-1, M-LEGACY-1, M-TRIPLEX-1 carry from v0.4.

- [ ] **Step 4: Run `npm test`** — full suite, including new M-* gates from M0–M4.

- [ ] **Step 5: Write `docs/v1.0/CHANGELOG.md`** following v0.4 pattern: list FRs by milestone with DD references.

- [ ] **Step 6: Write `docs/v1.0/commands.md`** — `/coherence:trust`, `/coherence:metrics`, `/coherence:audit --deep`, `/coherence:repair --reassociate`/`--expire-orphans`.

- [ ] **Step 7: Write `docs/v1.0/state-files.md`** — `trust-ledger.json` (gitignored), `section-symbol-index.json` (gitignored cache), `coherence/trust/<author-hash>.json` (committed).

- [ ] **Step 8: Write `docs/v1.0/privacy.md`** — telemetry event additions, hashed author identity, no clear-text leak.

- [ ] **Step 9: Write `docs/v1.0/rollback.md`** — re-install across v0.4 → v1.0; trust ledger preserved; team aggregate files committed.

- [ ] **Step 10: Update top-level README** with v1.0 section (intro paragraph + walkthrough).

- [ ] **Step 11: Write `RELEASE_NOTES_v1.0.0.md`** following v0.4 pattern.

- [ ] **Step 12: Run `npm run build`** to regenerate `commands/<name>.md` autogen stubs (DD-130), regenerate `README.md` `## Verification` section between markers, and produce `release-artifacts/cohrence-1.0.0.sha256`. Commit any newly-modified files (especially README.md and release-artifacts/).

- [ ] **Step 13: Tag `v1.0.0`** — `git tag -a v1.0.0 -m "Release v1.0.0"`.

- [ ] **Step 14: Push branches + tag**, kick off GitHub Actions release workflow.

- [ ] **Step 15: Post-release verification** — after CI completes, run `cosign verify-blob` against the published `.tgz` + `.sig` + `.pem` using the command rendered by `scripts/render-readme-verification.mjs`. Confirm Rekor transparency log entry exists at https://search.sigstore.dev/.

---

## Acceptance Summary

v1.0 GA when ALL conditions hold:

1. **All 27 FRs** (FR-TRUST-1..5, FR-LEDGER-1..5, FR-ASSERTS-1..5, FR-METRICS-1..3, FR-AUDIT-2..5, FR-SIGN-1..5, FR-REPAIR-1, FR-MANIFEST-5, FR-TELEMETRY-1) implemented with passing tests.

2. **All 23 M-gates green** at tag time:
   - M0: M-LEDGER-1, M-LEDGER-2, M-LEDGER-3, M-LEDGER-4
   - M1: M-TRUST-1, M-TRUST-2, M-TRUST-3, M-TRUST-4
   - M2: M-ASSERTS-1, M-ASSERTS-2, M-ASSERTS-3, M-ASSERTS-4
   - M3: M-METRICS-1, M-METRICS-2, M-AUDIT-1, M-AUDIT-2, M-AUDIT-3
   - M4: M-SIGN-1, M-SIGN-2, M-SIGN-3, M-REPAIR-1
   - Carry: M-LEGACY-1 (extended for `release-artifacts/`), M-COST-1, M-LISTING-1 (informational, awaiting Anthropic review)

3. **README `## Verification` section regenerated** from `package.json#repository.url`.

4. **cosign-signed tarball** with Rekor transparency log entry attached to GitHub Release. Verify via:
   ```
   cosign verify-blob cohrence-1.0.0.tgz \
     --signature cohrence-1.0.0.tgz.sig \
     --certificate cohrence-1.0.0.tgz.pem \
     --certificate-identity-regexp '<from-package.json>' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com
   ```

5. **Plugin marketplace listing** carries from v0.4 (awaiting Anthropic review; not gated on v1.0 GA).

6. **Performance bounds** verified empirically:
   - NFR-PERF-N6: `/coherence:metrics` + `/coherence:trust --status` < 200 ms p95
   - NFR-PERF-N7: `/coherence:audit` free tier < 100 ms p95; `--deep` cost gate < 50 ms
   - NFR-PERF-N8: stop-hook trust-ledger contribution < 20 ms p95 (100 affected sections)

---

## Risk Register

| Risk | Mitigation |
|---|---|
| `symbol_exists` cold-cache exceeds 50 ms p95 | Document as "first-call < 200 ms, subsequent < 50 ms"; not blocking. |
| Forkers don't run `npm run build` → README verification regex stale | Build script runs at `npm run build`; CI gate verifies marker presence (M-SIGN-3). Forkers who don't build still get the GitHub Security Advisories fallback path. |
| Personal trust-ledger.json grows unbounded across years | LRU cap at 200 events/section + DD-138 30-day half-life ensures old events lose weight. File-size bound: 200 events × 100 chars × 10000 sections ≈ 200 MB worst case; typical < 10 MB. |
| Team aggregate stale if developers don't sync regularly | 180-day staleness filter excludes inactive contributors. `/coherence:metrics` exposes `as_of` per contribution so reviewers can spot stale data. |
| `cosign` CI dependency outages | Local release with `--unsigned` produces `-UNSIGNED.tgz` (distinct filename prevents accidental distribution). |

---

## Notes for implementers

- **DD-118 carry:** No migration logic. v1.0 re-install preserves `.claude/coherence/` (per-project state); fresh install initializes empty `trust-ledger.json` on first event.
- **DD-130 carry:** New commands (`coherence:trust`, `coherence:metrics`) auto-generate stubs at build time via `scripts/generate-command-stubs.mjs`. Verify M-AUTOGEN-1 still passes after adding entries.
- **DD-128 carry (NFR-PATH-SANDBOX):** `/coherence:metrics --out` uses the same sandbox helper from `/coherence:export-metrics --out`. Reuse, don't reimplement.
- **Cassette discipline:** All `--deep` LLM call patterns use `src/llm/cassette.ts` for test determinism. Record once with `CASSETTE_MODE=record`, replay everywhere else.
- **Audit-pass amendments applied:** All TSD audit-pass amendments (3 passes) are folded into the step-by-step code above. Notable corrections:
  - Use `JSON.stringify(obj, null, 2)` for all state file writes (NOT a non-existent `newline: 'LF'` option)
  - `getCoherenceDir()` from `src/state/init.ts` (NOT `detectProjectRoot()`)
  - `fast-glob + readFile + includes()` for `symbol_exists` (NOT ripgrep)
  - Flag-based `--confirm-deep <signature>` (NOT stdin y/N) for cost gate
  - `--reassociate <old> --to <new>` (separate flags, NOT colon-separated)
  - `schema_version: 3` (global v0.3 family numbering, both for trust-ledger and team-aggregate per pass-3 amendment)
  - `summary.<sectionRef>.as_of` (NOT `score_computed_at` per pass-3 amendment)
  - Explicit `.sort()` on `fs.readdirSync` results for deterministic registry hash

---

## Plan Audit Pass 1 — 2026-05-13

Issues found: 0 Critical, 3 Important, 7 Minor, 2 Edge cases. Important issues amended inline above. Minor + edge-case amendments below.

### Important amendments applied inline

- **Important #1** (Task 1 Step 6) — `checkPromoteEligibility()` rewritten to compute the three FR-TRUST-4 conditions independently: score (`some(s => s.score >= 0.85)`), sections (`filter(s => s.score > 0.0).length >= 5`), days (earliest event spans ≥ 30 days). The original code incorrectly conflated score+sections by filtering both on ≥ 0.85.
- **Important #2** (Task 2 Step 2) — `teamAggregate.computeAggregate()` implementation added here so both `/coherence:trust --status` (M1) and `/coherence:metrics` (M3) can reuse it. Includes 180-day staleness filter, arithmetic mean across active contributors, and contested-flag derivation (FR-LEDGER-4 pass-3 threshold |aggregate| < 0.2 with ≥ 2 contributors).
- **Important #3** (Task 4 Step 2 expanded into Steps 2–7) — each of the 5 metrics-section renderers now has its own step with concrete implementation: `renderSummary`, `renderTopDrifting`, `renderTrustScores`, `renderCostTrend` (with edge-case-aware sparkline code), `renderRevertHotspots`, and `--out` sandbox wiring. Subsequent steps renumbered to 8–13.

### Minor amendments (notes for implementers)

- **Minor #4** (Task 2 Step 2) — Resolved by Important #2: `--status` displays a real team aggregate, not a stubbed null.
- **Minor #5** (Task 2 Step 7) — Net-new file gate amendment site: in v0.2 `src/proposals/acceptPropose.ts`, find the `kind`-based switch that requires `--accept` user input for `kind: 'skill' | 'agent' | 'slash_command' | 'annotate'`. Insert a pre-check: `if (ledger.auto_land_kinds.includes(proposal.kind)) skipExplicitAcceptCheck();`. Existing v0.2 quarantine-write behavior unchanged for non-promoted developers.
- **Minor #6** (Task 3 Step 1) — Add to parser: maintain a per-session `Set<sectionRef>` of sections that have already emitted the "ignored" warning. On parse, if `excess + unknown` count > 0 AND the section is not in the set, emit one stderr line via `console.error()` and add the ref to the set. Set cleared at SessionStart.
- **Minor #7** (Task 5 Step 6) — Default `/coherence:repair` flow (no flag) preserves v0.1 behavior (clear corrupt buffer, remove stale `stop-progress.json`, repair `pending.md` mismatches) AND additionally lists orphaned trust-ledger keys with numbered output, then prints usage hint for `--reassociate` and `--expire-orphans`. The flag branches handle their cases and return early; default path is fallthrough.
- **Minor #8** (Task 6) — Add post-tag verification step: after CI release workflow completes, manually run `cosign verify-blob` against the published `.tgz` + `.sig` + `.pem` using the same command rendered by `scripts/render-readme-verification.mjs`. Optional automated nightly verification via GitHub Action that downloads + verifies the latest release.
- **Minor #9** (Task 6) — `package.json#scripts.build` order: `tsc && node scripts/render-readme-verification.mjs && node scripts/generate-command-stubs.mjs && node scripts/copy-schemas.mjs`. README regeneration AFTER tsc (in case TS-derived metadata is needed; currently it isn't, but safe ordering) and BEFORE command stubs (independent).
- **Minor #10** (cross-task) — Helper functions and their ownership:
  - `appendCoherenceLog(line)` — existing v0.1 helper in `src/state/coherenceLog.ts`. Reused, no new code.
  - `emitMetricsEvent(eventType, payload)` — existing v0.3 helper in `src/state/metrics.ts`. v1.0 adds the 3 new event type strings to the v0.3 redaction matrix.
  - `hashFile(path)` — small helper using `crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')`. New helper in `src/util/hash.ts` (Task 4 Step 9 creates it).
  - `hashConcatFiles(paths)` — same as above but concatenates contents before hashing. Same file.
  - `atomicWrite(path, obj)` — existing v0.3 helper in `src/state/stateStore.ts`. Uses write-temp + rename pattern.
  - `writeWithSandbox(path, content)` — existing v0.4 helper from `/coherence:export-metrics --out` (DD-128).

### Edge-case amendments

- **Edge #11** (Task 1 Step 2) — Clock skew: `ageDays = Math.max(0, (now - Date.parse(ev._ts)) / DAY_MS)`. Future timestamps clamped to 0 (full-weight, no boost). Severe future timestamps (e.g. clock 1 year ahead) still get full weight, which is the conservative behavior — the event was recorded with the local clock, and trust shouldn't be inflated by clock errors.
- **Edge #12** (Task 1 Step 7 + Step 1) — Schema version mismatch: Zod parse fails on `schema_version !== 3`. Catch the error in `readLedger()` and surface as actionable error: `coherence: trust-ledger.json has unknown schema_version <N>; please re-install or delete the file`. Treat as fail-closed (no fallback to defaults) to avoid silent data corruption.

---

---

## Plan Audit Pass 2 — 2026-05-13

Issues found: 0 Critical, 1 Important, 6 Minor. Reduction from Pass 1: 12 → 7 (–42%). Important issue amended inline above. Minor items below.

### Important amendment applied inline

- **Important #1** (Task 5 Step 5) — GitHub Actions workflow permissions block extended: `id-token: write` ALONE is insufficient. Added `contents: write` required for `gh release create` to upload `.tgz` + `.sig` + `.pem` + `.sha256` artifacts. Without it, signing succeeds but the upload step fails with 403.

### Minor amendments (implementer notes)

- **Pass 2 Minor #2** (Task 5 Step 6) — Asymmetric flag validation: add a mirror check `if (reassociateNew && !reassociateOld) throw new Error('--to requires --reassociate <oldRef>')`. Currently only the forward direction (--reassociate without --to) errors; the reverse silently no-ops.
- **Pass 2 Minor #3** (Task 1 Step 7) — Concurrent-write test pattern: use `await Promise.all([...50 workers.map(spawnWorker)])` to collect all writes before asserting final state. Cassette-style assertion: final ledger has exactly N events where N is the number of distinct (sectionRef, kind) pairs from the workers' inputs.
- **Pass 2 Minor #4** (Task 6) — Insert explicit step between "all tests green" and "git tag": `Step 11.5: Run npm run build`. Ensures `commands/<name>.md` autogen stubs are present in the working tree, `README.md` ## Verification section is regenerated, and `release-artifacts/cohrence-1.0.0.sha256` exists before tag. (release-ga.mjs would do this anyway, but explicit step prevents skipping in local dry-run flows.)
- **Pass 2 Minor #5** (Task 1 Step 1/4) — Add explicit empty-ledger initialization in `readLedger()`: `if (!fs.existsSync(ledgerPath())) return { schema_version: 3, events: {}, summary: {}, promoted_at: null, promote_hint_emitted_at: null, auto_land_kinds: [] };`. This satisfies FR-LEDGER-5 absent-file behavior and avoids ENOENT on first-run.
- **Pass 2 Minor #6** (Task 4 + Task 2) — Add perf test steps:
  - In Task 4 Step 13: assert `/coherence:audit` free tier < 100 ms p95 with 1000-section synthetic index (NFR-PERF-N7).
  - In Task 2 Step 9: assert `/coherence:trust --status` < 200 ms p95 with same workload as `/coherence:metrics` test (NFR-PERF-N6-EXT).
- **Pass 2 Minor #7** (Task 2 Step 9) — Add M-LEDGER-2 test: synthetic `coherence/trust/` with 3 files — one synced 179 days ago (active), one synced 181 days ago (stale-excluded), one synced 366 days ago (would be pruned by --prune-stale). Assert `computeAggregate()` ignores the 181+ day file. Assert `/coherence:trust --prune-stale --yes` removes only the 366+ day file.

---

---

## Plan Audit Pass 3 — 2026-05-13

Issues found: 0 Critical, 1 Important, 5 Minor. Reduction from Pass 2: 7 → 6 (–14%). Important issue + 1 sparkline correctness fix amended inline. Other minors logged below.

### Inline amendments applied

- **Important #1** — Pass-2 minor amendments were documented but several weren't actually integrated into step text (high miss-risk). Pass-3 inlines: (a) Task 1 Step 3 — `readLedger()` now shows the absent-file empty-ledger initialization code (FR-LEDGER-5); (b) Task 2 Step 9 — `tests/integration/team-aggregate.test.ts` added with M-LEDGER-2 staleness scenarios + M-LEDGER-4 conflict scenarios + NFR-PERF-N6-EXT `--status` perf test; (c) Task 4 Step 13 — NFR-PERF-N7 `audit-free` perf test added; (d) Task 6 — `npm run build` step inserted as new Step 12 (renumbering: tag → 13, push → 14); (e) Task 6 — post-release verification added as Step 15.
- **Pass 3 Minor #2** (Task 4 Step 5 sparkline) — Unreachable `daily.length === 1` branch removed. The `daily.length < 3` guard above returns first, so the single-point case is implicitly handled there (returns "no trend yet" message). Comment added for clarity.

### Documented-only minors (low miss-risk, implementer can apply during work)

- **Pass 3 Minor #3** (Task 3 Step 5) — Assertion dispatch could parallelize via `Promise.all(asserts.slice(0, 10).map(a => runAssertion(section, a)))` for ~10x speedup when assertions include codebase-linked types. Not blocking for v1.0 (typical sections have ≤ 3 assertions, dominated by ripgrep-free fast-glob batched reads anyway).
- **Pass 3 Minor #4** (Risk register) — Worst-case ledger file size: 1000 sections × 200 events × ~100 chars ≈ 20 MB. Full-rewrite-per-event may exceed NFR-PERF-N8 (20 ms p95) in extreme deployments. Acceptable degradation for typical usage (most users < 1 MB). Optimization to per-section files deferred to v1.1 only if real-world telemetry shows breach.
- **Pass 3 Minor #5** (Task 5 Step 3) — README initial content phrasing: the markers `<!-- BEGIN: coherence-verification -->` / `<!-- END: coherence-verification -->` are the durable contract. Initial content can be empty (just markers); first `npm run build` populates it. The Step 3 wording "Insert ## Verification section with markers and initial content" is fine but implementers should know the initial content is immediately replaced.
- **Pass 3 Minor #6** (Task 1 Step 7) — `Promise.all` async test pattern: concurrent-write test scaffolding uses `await Promise.all([...50 workers.map(w => w.spawn())])`. Already documented in Pass 2 Minor #3; pass 3 reaffirms.

---

End of plan (Pass 1 + Pass 2 + Pass 3 audit amendments applied 2026-05-13).
