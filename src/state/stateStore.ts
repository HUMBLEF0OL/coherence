/**
 * Persistent state store with atomic writes, AJV validation, and quarantine.
 * TS-3, NFR-RELIABILITY-1/7
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, unlinkSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { lockManager } from './locks.js';
import { quarantineFile } from './quarantine.js';
import { ajv } from './ajvInstance.js';
import { nowIsoUtc } from '../util/time.js';

const require = createRequire(import.meta.url);

const SCHEMA_NAMES = [
  'config.schema.json',
  'version.schema.json',
  'host-capabilities.schema.json',
  'drift-buffer.schema.json',
  'velocity.schema.json',
  'stop-progress.schema.json',
  'cost-ledger.schema.json',
  'subagent-stats.schema.json',
  'section-index.schema.json',
  'plan.schema.json',
  // v0.2 additions (M2)
  'graduation.schema.json',
  'proposal-cache.schema.json',
  'proposal.schema.json',
  'signal-cache.schema.json',
  'state-snapshot.schema.json',
  'scan-cache-state.schema.json',
] as const;

const FILE_TO_SCHEMA: Record<string, string> = {
  'config.json': 'config.schema.json',
  'version.json': 'version.schema.json',
  'host-capabilities.json': 'host-capabilities.schema.json',
  'drift-buffer.json': 'drift-buffer.schema.json',
  'velocity.json': 'velocity.schema.json',
  'stop-progress.json': 'stop-progress.schema.json',
  'cost-ledger.json': 'cost-ledger.schema.json',
  'subagent-stats.json': 'subagent-stats.schema.json',
  'section-index.json': 'section-index.schema.json',
  'plan.json': 'plan.schema.json',
  // v0.2 additions (M2)
  'graduation.json': 'graduation.schema.json',
  'proposal-cache.json': 'proposal-cache.schema.json',
  'signal-cache.json': 'signal-cache.schema.json',
  'state-snapshot.json': 'state-snapshot.schema.json',
  'scan-cache/state.json': 'scan-cache-state.schema.json',
};

let schemasLoaded = false;

function ensureSchemasLoaded(coherenceDir?: string): void {
  if (schemasLoaded) return;
  // Resolve schema directory relative to this source file (fileURLToPath handles URL encoding)
  const schemaDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schemas');
  for (const name of SCHEMA_NAMES) {
    if (!ajv.getSchema(name)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const schema = require(path.join(schemaDir, name));
      ajv.addSchema(schema as object, name);
    }
  }
  schemasLoaded = true;
  void coherenceDir; // suppress unused warning
}

export class StateStore {
  constructor(
    private readonly coherenceDir: string,
    private readonly quarantineDir: string,
  ) {
    mkdirSync(coherenceDir, { recursive: true });
    mkdirSync(quarantineDir, { recursive: true });
    ensureSchemasLoaded(coherenceDir);
  }

  /** The .claude/coherence/ directory this store reads from / writes to.
   *  Used by lock-target derivation in proposalStore (Q5). */
  get coherencePath(): string {
    return this.coherenceDir;
  }

  /** Quarantine root for this store. Used by FR-FAILURE-N3 callers that
   *  need to quarantine an externally-mutated state file (DD-088). */
  get quarantinePath(): string {
    return this.quarantineDir;
  }

  /** Read and validate a JSON state file. Returns null if missing or corrupt (quarantined). */
  // eslint-disable-next-line @typescript-eslint/require-await -- public StateStore.read API; tests + callers expect Promise
  async read<T>(filename: string): Promise<T | null> {
    const filePath = path.join(this.coherenceDir, filename);
    if (!existsSync(filePath)) return null;

    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.quarantine(filePath, `JSON parse error in ${filename}`);
      return null;
    }

    const schemaName = FILE_TO_SCHEMA[filename];
    if (schemaName) {
      const valid = ajv.validate(schemaName, parsed);
      if (!valid) {
        this.quarantine(filePath, `Schema validation failed: ${ajv.errorsText()}`);
        return null;
      }
    }

    return parsed as T;
  }

  /** Atomically write a validated JSON state file (temp + rename). */
  async write<T>(filename: string, data: T): Promise<void> {
    const filePath = path.join(this.coherenceDir, filename);
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

    const schemaName = FILE_TO_SCHEMA[filename];
    if (schemaName) {
      const valid = ajv.validate(schemaName, data);
      if (!valid) {
        throw new Error(`StateStore.write: invalid data for ${filename}: ${ajv.errorsText()}`);
      }
    }

    const acquired = await lockManager.acquire(filePath);
    if (!acquired && lockManager.degraded) {
      return;
    }

    try {
      writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      renameSync(tmpPath, filePath);
    } finally {
      lockManager.release(filePath);
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
      } catch { /* best-effort */ }
    }
  }

  /** Append a JSONL line atomically (read-full, append, write-full via temp+rename). */
  async appendJsonl(filename: string, record: unknown): Promise<void> {
    const filePath = path.join(this.coherenceDir, filename);

    const acquired = await lockManager.acquire(filePath);
    if (!acquired && lockManager.degraded) return;

    try {
      let existing = '';
      try { existing = readFileSync(filePath, 'utf8'); } catch { /* new file */ }
      const line = JSON.stringify({ ...(record as object), _ts: nowIsoUtc() });
      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(tmpPath, existing + line + '\n', 'utf8');
      renameSync(tmpPath, filePath);
    } finally {
      lockManager.release(filePath);
    }
  }

  /** Append to a Markdown log file (newest-first, append-only, never rotated in v0.1). */
  async appendMarkdown(filename: string, content: string): Promise<void> {
    const filePath = path.join(this.coherenceDir, filename);
    const acquired = await lockManager.acquire(filePath);
    if (!acquired && lockManager.degraded) return;

    try {
      let existing = '';
      try { existing = readFileSync(filePath, 'utf8'); } catch { /* new */ }
      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(tmpPath, content + '\n' + existing, 'utf8');
      renameSync(tmpPath, filePath);
    } finally {
      lockManager.release(filePath);
    }
  }

  private quarantine(filePath: string, reason: string): void {
    console.warn(`[coherence] quarantining ${filePath}: ${reason}`);
    quarantineFile(filePath, this.quarantineDir);
  }
}
