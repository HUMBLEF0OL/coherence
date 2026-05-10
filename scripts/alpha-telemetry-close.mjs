#!/usr/bin/env node
/**
 * v0.2-alpha telemetry close-out (M8).
 *
 * Reads `.claude/coherence/metrics.jsonl`, aggregates the v0.2 catalogue
 * (FR-OBS-N4) into a release artefact, and writes
 * `release-artifacts/v0.2-alpha-telemetry-<ts>.json`.
 *
 * Privacy-safe-by-construction (FR-OBS-N5): only digest fields are read.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

function readJsonl(p) {
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

function bucketByEvent(events) {
  const out = {};
  for (const e of events) {
    out[e.event] = (out[e.event] ?? 0) + 1;
  }
  return out;
}

function detectorPrecision(events) {
  const fired = events.filter(
    (e) => e.event === 'proposal_signal_observed' && e.would_have_fired === true,
  );
  const accepted = events.filter((e) => e.event === 'proposal_accepted');
  const rejected = events.filter((e) => e.event === 'proposal_rejected');
  const denom = fired.length;
  if (denom === 0) return { precision: 0, fired: 0, accepted: accepted.length, rejected: rejected.length };
  return {
    precision: accepted.length / denom,
    fired: denom,
    accepted: accepted.length,
    rejected: rejected.length,
  };
}

function coOccurrenceMatrix(events) {
  const window = 30 * 60 * 1000;
  const accepts = events
    .filter((e) => e.event === 'proposal_accepted' || e.event === 'proposal_rejected')
    .map((e) => ({ ts: Date.parse(e._ts ?? new Date(0).toISOString()), kind: e.signal_kind }));
  let crossKind = 0;
  for (let i = 0; i < accepts.length; i++) {
    for (let j = i + 1; j < accepts.length; j++) {
      if (Math.abs(accepts[i].ts - accepts[j].ts) > window) continue;
      if (accepts[i].kind && accepts[j].kind && accepts[i].kind !== accepts[j].kind) {
        crossKind += 1;
      }
    }
  }
  return { cross_kind_pairs: crossKind, total_actions: accepts.length };
}

function main() {
  const argv = process.argv.slice(2);
  const projectRoot = argv[0] ?? process.cwd();
  const metricsPath = path.join(projectRoot, '.claude', 'coherence', 'metrics.jsonl');
  const events = readJsonl(metricsPath);
  const summary = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    counts: bucketByEvent(events),
    detector_precision: detectorPrecision(events),
    co_occurrence: coOccurrenceMatrix(events),
    sessions_seen: new Set(events.map((e) => e.session_id).filter(Boolean)).size,
  };
  const out = path.join(projectRoot, 'release-artifacts');
  mkdirSync(out, { recursive: true });
  const outPath = path.join(out, `v0.2-alpha-telemetry-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(`[alpha-telemetry-close] wrote ${outPath}`);
}

main();
