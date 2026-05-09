/**
 * Two-tier hallucination grep (DD-032/DD-047).
 * FR-STOP-7, TS-5 §5.5
 */
import { tokenizeImportLine as tokenizeTsJs } from './registries/ts-js.js';
import { tokenizeImportLine as tokenizePython } from './registries/python.js';
import { tokenizeImportLine as tokenizeGo } from './registries/go.js';
import { tokenizeImportLine as tokenizeRust } from './registries/rust.js';
import { tokenizeImportLine as tokenizeJava } from './registries/java.js';
import { tokenizeImportLine as tokenizeCsharp } from './registries/csharp.js';
import { tokenizeImportLine as tokenizeRuby } from './registries/ruby.js';
import { tokenizeImportLine as tokenizePhp } from './registries/php.js';

export interface HallucinationResult {
  passed: boolean;
  unknownStrictTokens: string[];
  unknownLooseOnlyTokens: string[];
  demoteClass: boolean;
}

/**
 * Strict-tier indicators: a token is suspicious if it matches any of:
 * - Contains path separators (/, \, ::)
 * - Member-access pattern (foo.bar)
 * - Appears to be an import-line token
 * - Length ≥ 16 with a structural marker (/, \, ., ::, -)
 * - Length ≥ 6 mixed-case-with-digit
 */
function isStrictTierToken(token: string): boolean {
  if (token.includes('/') || token.includes('\\') || token.includes('::')) return true;
  if (/\w+\.\w+/.test(token)) return true; // member access
  if (token.length >= 16 && /[/\\.:_-]/.test(token)) return true;
  if (token.length >= 6 && /[A-Z]/.test(token) && /[a-z]/.test(token) && /\d/.test(token)) return true;
  return false;
}

function extractTokensFromDiff(diffRaw: string): string[] {
  const addedLines = diffRaw
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));

  const tokens = new Set<string>();

  for (const line of addedLines) {
    // Split on whitespace and punctuation to get word tokens
    const words = line.split(/[\s,;()\[\]{}=<>!&|^~`@#$%]+/).filter(Boolean);
    for (const w of words) tokens.add(w);

    // Also extract import-line tokens for supported languages
    for (const tokenizer of [
      tokenizeTsJs,
      tokenizePython,
      tokenizeGo,
      tokenizeRust,
      tokenizeJava,
      tokenizeCsharp,
      tokenizeRuby,
      tokenizePhp,
    ]) {
      for (const t of tokenizer(line)) tokens.add(t);
    }
  }

  return [...tokens];
}

/**
 * Build a known-token set from session-changed files content.
 */
export function buildKnownTokenSet(fileContents: string[]): Set<string> {
  const known = new Set<string>();
  for (const content of fileContents) {
    const words = content.split(/[\s,;()\[\]{}=<>!&|^~`@#$%*'"]+/).filter(Boolean);
    for (const w of words) known.add(w);
  }
  return known;
}

/**
 * Run two-tier hallucination check.
 * @param diffRaw - raw unified diff
 * @param changedFilesContent - content of session-changed source files (strict tier)
 * @param projectFilesContent - content of all project files (loose tier)
 */
export function checkHallucination(
  diffRaw: string,
  changedFilesContent: string[],
  projectFilesContent: string[],
): HallucinationResult {
  const tokens = extractTokensFromDiff(diffRaw);

  const strictKnown = buildKnownTokenSet(changedFilesContent);
  const looseKnown = buildKnownTokenSet([...changedFilesContent, ...projectFilesContent]);

  const unknownStrictTokens: string[] = [];
  const unknownLooseOnlyTokens: string[] = [];

  for (const token of tokens) {
    if (!isStrictTierToken(token)) continue;

    if (looseKnown.has(token)) {
      // Known somewhere in the project
      if (!strictKnown.has(token)) {
        // Known project-wide but NOT in the changed files — loose-only unknown
        unknownLooseOnlyTokens.push(token);
      }
      // else: known in changed files — fine, no issue
    } else {
      // Unknown to both tiers — hallucination candidate
      unknownStrictTokens.push(token);
    }
  }

  // ≥ 3 loose-only tokens → demote class one tier (FR-STOP-7)
  const demoteClass = unknownLooseOnlyTokens.length >= 3;

  // Fail (reject entirely) if tokens unknown even to loose tier
  const passed = unknownStrictTokens.length === 0;

  return { passed, unknownStrictTokens, unknownLooseOnlyTokens, demoteClass };
}
