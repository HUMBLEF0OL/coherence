/**
 * Cassette record/replay for deterministic LLM testing.
 * Replay requires cassette on disk; recording requires COHERENCE_REFRESH_CASSETTES=1.
 * BRD-4 §4.2 — no silent re-recording.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface CassettePayload {
  content: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  timestamp: string;
}

function cassettesDir(): string {
  // In test environments, cassettes live alongside tests; in prod, unused
  const fromEnv = process.env['COHERENCE_CASSETTES_DIR'];
  if (fromEnv) return fromEnv;
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../tests/cassettes',
  );
}

function cassettePath(id: string): string {
  return path.join(cassettesDir(), `${id}.json`);
}

export function cassetteExists(id: string): boolean {
  return existsSync(cassettePath(id));
}

export function loadCassette(id: string): CassettePayload | null {
  const p = cassettePath(id);
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf8');
    return JSON.parse(raw) as CassettePayload;
  } catch {
    return null;
  }
}

export function recordCassette(id: string, payload: CassettePayload): void {
  if (process.env['COHERENCE_REFRESH_CASSETTES'] !== '1') {
    // Silently skip — never overwrite without explicit opt-in
    return;
  }
  const p = cassettePath(id);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

/**
 * Verify that a cassette recorded response still matches what the API would return.
 * Fails CI if a cassette would change (determinism check).
 * Called only when COHERENCE_REFRESH_CASSETTES=1 and cassette already exists.
 */
export function assertCassetteUnchanged(id: string, fresh: CassettePayload): void {
  const existing = loadCassette(id);
  if (!existing) return;
  if (existing.content !== fresh.content) {
    throw new Error(
      `[coherence] Cassette determinism check failed for "${id}": ` +
        `recorded content differs from fresh API response. ` +
        `Run with COHERENCE_REFRESH_CASSETTES=1 and review the diff before committing.`,
    );
  }
}
