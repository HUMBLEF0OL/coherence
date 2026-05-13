/**
 * /coherence:audit --deep — LLM cross-section consistency pass (TS-6, FR-AUDIT-3..5).
 *
 * Two-step flag-based confirmation (no TTY, no stdin prompts):
 *   1. First call (no --confirm-deep) prints the candidate pairs + cost
 *      estimate and a 12-char signature. No LLM call is made.
 *   2. Second call with `--confirm-deep <signature>` actually invokes the LLM
 *      replay (CASSETTE) or live (CI with --no-confirm) consistency pass.
 *
 * The signature is the first 12 hex chars of sha256 over the candidate pair
 * list. If the pair list changes between calls (e.g. underlying index
 * rebuilt), the user must re-invoke without --confirm-deep to get a fresh
 * estimate.
 */
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { StateStore } from '../state/stateStore.js';
import { loadOrBuildIndex, computeSymbolSharingPairs } from './sectionSymbolIndex.js';
import { emitMetric } from '../state/metrics.js';
import { llmCall } from '../llm/client.js';

const MAX_PAIRS = 10;

export interface DeepAuditArgs {
  store: StateStore;
  projectRoot: string;
  argv: string[];
  sessionId: string;
}

interface ConsistencyVerdict {
  consistent: boolean;
  issues?: string[];
}

function loadAuditConsistencyPrompt(): string {
  const promptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'prompts', 'v3');
  return readFileSync(path.join(promptsDir, 'audit-consistency.md'), 'utf8');
}

function readSectionBody(projectRoot: string, sectionRef: string): string {
  const filePath = sectionRef.split('#')[0] ?? '';
  if (!filePath) return '';
  const abs = path.resolve(projectRoot, filePath);
  if (!existsSync(abs)) return '';
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return '';
  }
}

function cassetteIdForPair(a: string, b: string, signature: string): string {
  // Deterministic ID for replay: cassette is keyed by both endpoints + the
  // overall pair-list signature so concurrent edits don't replay stale data.
  const h = createHash('sha256').update(`audit_deep|${a}|${b}|${signature}`).digest('hex').slice(0, 16);
  return `audit-deep-${h}`;
}

function parseVerdict(content: string): ConsistencyVerdict | null {
  // Locate a JSON object in the LLM response. Tolerant of leading prose.
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as { consistent?: unknown; issues?: unknown };
    if (typeof obj.consistent !== 'boolean') return null;
    const issues = Array.isArray(obj.issues)
      ? obj.issues.filter((x): x is string => typeof x === 'string')
      : undefined;
    return issues ? { consistent: obj.consistent, issues } : { consistent: obj.consistent };
  } catch {
    return null;
  }
}

function getFlagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx === argv.length - 1) return undefined;
  return argv[idx + 1];
}

export function computeSignature(pairs: Array<{ a: string; b: string }>): string {
  const h = createHash('sha256');
  for (const p of pairs) h.update(`${p.a}|${p.b}|`);
  return h.digest('hex').slice(0, 12);
}

export async function handleDeepAudit(args: DeepAuditArgs): Promise<string> {
  const { store, projectRoot, argv, sessionId } = args;
  const confirmSig = getFlagValue(argv, '--confirm-deep');
  const noConfirm = argv.includes('--no-confirm') && process.env.CI === 'true';
  const sectionsFilter = getFlagValue(argv, '--sections');

  const index = await loadOrBuildIndex(projectRoot);
  const filterSet = sectionsFilter
    ? new Set(sectionsFilter.split(',').map((s) => s.trim()).filter(Boolean))
    : undefined;
  const pairs = computeSymbolSharingPairs(index, filterSet).slice(0, MAX_PAIRS);
  const signature = computeSignature(pairs);

  if (pairs.length === 0) {
    return '_/coherence:audit --deep: no candidate pairs (sections share fewer than 3 symbols)._';
  }

  if (!confirmSig && !noConfirm) {
    await emitMetric(store, {
      event: 'audit_deep_estimate_shown',
      session_id: sessionId,
      pair_count: pairs.length,
      signature,
    } as unknown as Parameters<typeof emitMetric>[1]);
    const lines: string[] = [];
    lines.push('# /coherence:audit --deep — estimate');
    lines.push('');
    lines.push(`Candidate pairs (${pairs.length}, cap ${MAX_PAIRS}):`);
    for (const p of pairs) {
      lines.push(`  - \`${p.a}\` ↔ \`${p.b}\` (${p.shared.length} shared symbols)`);
    }
    lines.push('');
    lines.push(`Estimated cost: ${pairs.length} LLM call(s), ~${pairs.length * 1500} tokens.`);
    lines.push(`Signature: \`${signature}\``);
    lines.push('');
    if (pairs.length >= MAX_PAIRS) {
      lines.push('> More candidates exist — narrow with `--sections sec1,sec2,...` to focus.');
      lines.push('');
    }
    lines.push('Re-run with `--confirm-deep ' + signature + '` to actually invoke the LLM pass.');
    lines.push('In CI: pass `--no-confirm` (only honoured when `CI=true`).');
    return lines.join('\n');
  }

  if (confirmSig && confirmSig !== signature) {
    throw new Error(
      `coherence: --confirm-deep ${confirmSig} does not match the current pair-list signature ${signature}. ` +
        'Re-run /coherence:audit --deep (no confirm flag) to refresh the estimate.',
    );
  }

  await emitMetric(store, {
    event: 'audit_deep_invoked',
    session_id: sessionId,
    pair_count: pairs.length,
    signature,
  } as unknown as Parameters<typeof emitMetric>[1]);

  // Live LLM call orchestration — runs each pair through llmCall with a
  // deterministic cassetteId. Cassettes live under tests/cassettes/; when a
  // cassette exists the call replays it (no API spend, no network), making
  // this deterministic in tests. Without cassettes a real API call is made.
  const systemPrompt = loadAuditConsistencyPrompt();
  const lines: string[] = [];
  lines.push('# /coherence:audit --deep — consistency pass');
  lines.push('');
  lines.push(`Analysed ${pairs.length} pair(s) with signature \`${signature}\`.`);
  for (const p of pairs) {
    lines.push('');
    lines.push(`## \`${p.a}\` ↔ \`${p.b}\``);
    lines.push(`Shared symbols: ${p.shared.slice(0, 8).map((s) => '\`' + s + '\`').join(', ')}` + (p.shared.length > 8 ? `, … (${p.shared.length} total)` : ''));
    const bodyA = readSectionBody(projectRoot, p.a);
    const bodyB = readSectionBody(projectRoot, p.b);
    const userMessage = JSON.stringify({ section_a: { ref: p.a, body: bodyA }, section_b: { ref: p.b, body: bodyB } });
    try {
      const resp = await llmCall({
        stage: 'audit_deep',
        systemPrompt,
        userMessage,
        cassetteId: cassetteIdForPair(p.a, p.b, signature),
      });
      const verdict = parseVerdict(resp.content);
      if (!verdict) {
        lines.push('LLM consistency verdict: _unparseable response from prompt v3_.');
      } else if (verdict.consistent) {
        lines.push('LLM consistency verdict: **consistent**.');
      } else {
        lines.push('LLM consistency verdict: **INCONSISTENT**.');
        for (const issue of verdict.issues ?? []) {
          lines.push(`  - ${issue}`);
        }
      }
    } catch (e) {
      lines.push(`LLM consistency verdict: _call failed: ${e instanceof Error ? e.message : String(e)}_`);
    }
  }
  return lines.join('\n');
}
