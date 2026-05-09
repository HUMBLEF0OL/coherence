/**
 * Release-candidate live cost burn — opt-in non-cassette run.
 * Gated behind COHERENCE_LIVE_COST_RUN=1.
 * Budget: ≤ $5 per run. Produces PG-5 evidence for release notes.
 * DG-6, TS-7 §7.2
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MAX_COST_USD = 5.0;
const EVIDENCE_DIR = path.join(PROJECT_ROOT, 'release-artifacts');

if (!process.env.COHERENCE_LIVE_COST_RUN) {
  console.log('[cost-burn] Skipped: set COHERENCE_LIVE_COST_RUN=1 to run live cost verification.');
  console.log('[cost-burn] This script burns real API budget (≤ $5). Use only for release candidates.');
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[cost-burn] Error: ANTHROPIC_API_KEY not set.');
  process.exit(1);
}

console.log('[cost-burn] Starting live cost verification run...');
console.log(`[cost-burn] Budget limit: $${MAX_COST_USD}`);

let totalCostUsd = 0;

async function runCostProbe(label, sectionCount) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), `coherence-costburn-`));
  try {
    const { StateStore } = await import('../src/state/stateStore.js');
    const { BufferLifecycle } = await import('../src/buffer/lifecycle.js');
    const { runStopOrchestrator } = await import('../src/pipeline/stop.js');

    const store = new StateStore(
      path.join(tmpDir, '.claude', 'coherence'),
      path.join(tmpDir, '.claude', 'coherence', 'quarantine'),
    );
    const lifecycle = new BufferLifecycle(store);

    for (let i = 0; i < sectionCount; i++) {
      await lifecycle.append({
        path: `docs/doc${i}.md`,
        sectionRef: `docs/doc${i}.md#s${i}`,
        contentHash: 'a'.repeat(64),
        triggeredAt: new Date().toISOString(),
        source: 'posttooluse',
      });
    }

    const result = await runStopOrchestrator({
      sessionId: `cost-burn-${Date.now()}`,
      projectRoot: tmpDir,
      store,
      sectionIndex: [],
      projectFileContents: [],
      mode: 'observe',
    });

    totalCostUsd += result.cost_usd;
    console.log(`[cost-burn] ${label}: ${sectionCount} sections, $${result.cost_usd.toFixed(4)}`);

    if (totalCostUsd > MAX_COST_USD) {
      console.error(`[cost-burn] Budget exceeded: $${totalCostUsd.toFixed(4)} > $${MAX_COST_USD}`);
      process.exit(1);
    }

    return result.cost_usd;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Run small and medium probes
const results = [];
results.push({ label: 'small (1 section)', sections: 1, cost: await runCostProbe('small', 1) });
results.push({ label: 'medium (12 sections)', sections: 12, cost: await runCostProbe('medium', 12) });

// Write evidence file
mkdirSync(EVIDENCE_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const evidencePath = path.join(EVIDENCE_DIR, `cost-evidence-${ts}.json`);
const evidence = {
  generated_at: new Date().toISOString(),
  budget_usd: MAX_COST_USD,
  total_cost_usd: totalCostUsd,
  results,
};
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
console.log(`[cost-burn] Evidence written to ${evidencePath}`);
console.log(`[cost-burn] Total cost: $${totalCostUsd.toFixed(4)}`);
