/**
 * Performance harness — runs each hook in isolation against synthetic events.
 * Records p50/p95/p99 latencies and RSS memory.
 * DD-059, TS-7 §7.7
 */
import { mkdtempSync, rmSync, cpSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODEBASES_DIR = path.join(__dirname, 'codebases');

export type HookName = 'postToolUse' | 'sessionStart' | 'stop';

export interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  samples: number;
}

export interface MemoryStats {
  p50RssBytes: number;
  p95RssBytes: number;
  maxRssBytes: number;
}

export interface HarnessCellResult {
  hookName: HookName;
  codebaseName: string;
  latency: LatencyStats;
  memory: MemoryStats;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runHookOnce(
  hookName: HookName,
  projectRoot: string,
): Promise<{ elapsedMs: number; rssBytes: number }> {
  const before = process.memoryUsage().rss;
  const start = performance.now();

  if (hookName === 'postToolUse') {
    const { postToolUseHook } = await import('../../src/hooks/postToolUse.js');
    await postToolUseHook({ path: path.join(projectRoot, 'docs', 'api.md') }, projectRoot);
  } else if (hookName === 'sessionStart') {
    const { sessionStartHook } = await import('../../src/hooks/sessionStart.js');
    await sessionStartHook({}, projectRoot);
  } else if (hookName === 'stop') {
    const { stopHook } = await import('../../src/hooks/stop.js');
    await stopHook({ session_id: `perf-${Date.now()}` }, projectRoot);
  }

  const elapsedMs = performance.now() - start;
  const rssBytes = process.memoryUsage().rss - before;
  return { elapsedMs, rssBytes: Math.max(0, rssBytes) };
}

export async function runHarnessCell(
  hookName: HookName,
  codebaseName: string,
  iterations = 20,
): Promise<HarnessCellResult> {
  const sourceDir = path.join(CODEBASES_DIR, codebaseName);
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), `coherence-perf-${codebaseName}-`));

  try {
    // Copy codebase fixture to temp dir
    cpSync(sourceDir, tmpDir, { recursive: true });

    const latencies: number[] = [];
    const rssValues: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { elapsedMs, rssBytes } = await runHookOnce(hookName, tmpDir);
      latencies.push(elapsedMs);
      rssValues.push(rssBytes);
    }

    latencies.sort((a, b) => a - b);
    rssValues.sort((a, b) => a - b);

    return {
      hookName,
      codebaseName,
      latency: {
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        p99: percentile(latencies, 99),
        min: latencies[0],
        max: latencies[latencies.length - 1],
        samples: iterations,
      },
      memory: {
        p50RssBytes: percentile(rssValues, 50),
        p95RssBytes: percentile(rssValues, 95),
        maxRssBytes: rssValues[rssValues.length - 1],
      },
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function runFullHarness(iterations = 20): Promise<HarnessCellResult[]> {
  const hooks: HookName[] = ['postToolUse', 'sessionStart'];
  const codebases = ['small', 'medium'];
  const results: HarnessCellResult[] = [];

  for (const hookName of hooks) {
    for (const codebaseName of codebases) {
      const result = await runHarnessCell(hookName, codebaseName, iterations);
      results.push(result);
    }
  }

  return results;
}
