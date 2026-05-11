/**
 * v0.3 DD-107 — privacy-safe developer identity hashing.
 *
 * The plan-store needs a stable identifier for "who created this plan" /
 * "who accepted this plan" without persisting raw email addresses or names.
 * The hash is SHA-256 of `git config user.email` (lowercased, trimmed),
 * truncated to 12 hex chars (consistent with DD-068 conventions). Plain names
 * may surface in *interactive* CLI output for plan authors but are never
 * persisted to plan files.
 *
 * Determinism: identical email → identical hash across machines + time.
 * Test-friendly: a test override is exposed for fixtures that don't have
 * `git config` populated.
 */
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';

const HASH_LEN = 12;

let _cachedHash: string | null = null;
let _cachedDisplay: string | null = null;
let _override: { hash: string; display: string } | null = null;

export interface DeveloperIdentity {
  /** 12-hex SHA-256 of `git config user.email` (lowercased, trimmed). */
  hash: string;
  /**
   * `git config user.name` if available, else email — used in interactive CLI
   * output ONLY (never persisted to plan files).
   */
  display: string;
}

/** Test/CI helper: override the resolved identity for one process. */
export function setIdentityOverride(value: DeveloperIdentity | null): void {
  _override = value;
  _cachedHash = null;
  _cachedDisplay = null;
}

export function getIdentity(): DeveloperIdentity {
  if (_override) return _override;
  if (_cachedHash !== null && _cachedDisplay !== null) {
    return { hash: _cachedHash, display: _cachedDisplay };
  }

  const email = readGitConfig('user.email') ?? 'anonymous@local';
  const name = readGitConfig('user.name') ?? email;

  _cachedHash = hashEmail(email);
  _cachedDisplay = sanitiseDisplay(name);

  return { hash: _cachedHash, display: _cachedDisplay };
}

/**
 * Audit-3 S7: strip ANSI / CSI control sequences from the display name
 * before echoing it. A developer's `git config user.name` of
 * `\x1b[2J\x1b[H` would otherwise clear the terminal when surfaced by
 * any /coherence:plan-* CLI output. Strip both 7-bit (`\x1b[...m`) and
 * raw C0 control characters except TAB.
 */
/* eslint-disable no-control-regex */
/**
 * Audit-3 S7 — exported for direct unit testing. Not part of the public
 * identity API. Use `getIdentity().display` in production code; this helper
 * is the implementation detail that strips ANSI/CSI control sequences so a
 * malicious `git config user.name` cannot inject terminal escapes.
 */
export function sanitiseDisplay(raw: string): string {
  return raw
    // strip CSI escape sequences
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    // strip OSC sequences
    .replace(/\x1b\][^\x07]*\x07/g, '')
    // strip remaining ESC + single char
    .replace(/\x1b./g, '')
    // strip C0 controls except TAB (0x09)
    .replace(/[\x00-\x08\x0a-\x1f\x7f]/g, '')
    .trim();
}
/* eslint-enable no-control-regex */

export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, HASH_LEN);
}

function readGitConfig(key: string): string | null {
  try {
    const out = execFileSync('git', ['config', '--get', key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
