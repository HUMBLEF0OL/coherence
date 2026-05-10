/**
 * Subagent provenance tracker.
 * Line-level when host exposes subagent_invocation_id + ranges; file-level fallback.
 * TS-2 §2.4, DD-013, DD-062
 */
import type { HostCapabilities } from '../types/index.js';
import { nowIsoUtc } from '../util/time.js';

export type SubagentClassification = 'accepted' | 'edited' | 'discarded' | 'rejected';

export interface SubagentAttribution {
  invocation_id: string;
  session_id: string;
  started_at: string;
  files_touched: string[];
  lines_added?: number;
  lines_removed?: number;
  classification: SubagentClassification;
}

interface SubagentEvent {
  invocation_id?: string;
  session_id?: string;
  tool_calls?: Array<{ path?: string; lines_added?: number; lines_removed?: number }>;
  [key: string]: unknown;
}

const FILE_LEVEL_WINDOW_MS = 5 * 60 * 1000; // 5 min
const recentFileLevelFiles: Array<{ path: string; ts: number }> = [];

export function captureProvenance(
  event: unknown,
  capabilities: HostCapabilities,
): SubagentAttribution {
  const evt = event as SubagentEvent;
  const now = nowIsoUtc();

  if (capabilities.subagent_attribution && evt.invocation_id) {
    // Line-level: host exposes invocation_id + line ranges
    let linesAdded = 0;
    let linesRemoved = 0;
    const files: string[] = [];

    for (const call of evt.tool_calls ?? []) {
      if (call.path) files.push(call.path);
      linesAdded += call.lines_added ?? 0;
      linesRemoved += call.lines_removed ?? 0;
    }

    return {
      invocation_id: evt.invocation_id ?? `synthetic-${Date.now()}`,
      session_id: evt.session_id ?? 'unknown',
      started_at: now,
      files_touched: files,
      lines_added: linesAdded,
      lines_removed: linesRemoved,
      classification: 'accepted',
    };
  }

  // File-level fallback: attribute files within min(5 min, same turn)
  const windowCutoff = Date.now() - FILE_LEVEL_WINDOW_MS;
  const recent = recentFileLevelFiles
    .filter((f) => f.ts > windowCutoff)
    .map((f) => f.path);

  return {
    invocation_id: `file-level-${Date.now()}`,
    session_id: evt.session_id ?? 'unknown',
    started_at: now,
    files_touched: recent,
    classification: 'accepted',
  };
}

export function registerFileTouched(filePath: string): void {
  recentFileLevelFiles.push({ path: filePath, ts: Date.now() });
  // Prune entries older than window
  const cutoff = Date.now() - FILE_LEVEL_WINDOW_MS;
  while (recentFileLevelFiles.length > 0 && recentFileLevelFiles[0].ts < cutoff) {
    recentFileLevelFiles.shift();
  }
}
