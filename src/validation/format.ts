/**
 * Stage 2 response format validator.
 * Accepts unified diff, NO_PATCH_NEEDED, ESCALATE, or PLAN_DISAGREES.
 * DD-008, DD-033, DD-042
 */
import parseDiff from 'parse-diff';

export type ParsedResponse =
  | { kind: 'diff'; raw: string; files: ReturnType<typeof parseDiff> }
  | { kind: 'no-patch' }
  | { kind: 'escalate' }
  | { kind: 'plan-disagrees'; reason: string }
  | { kind: 'invalid'; reason: string };

export function parseStage2Response(raw: string): ParsedResponse {
  const trimmed = raw.trim();

  if (trimmed === 'NO_PATCH_NEEDED') {
    return { kind: 'no-patch' };
  }

  if (trimmed === 'ESCALATE') {
    return { kind: 'escalate' };
  }

  if (trimmed.startsWith('PLAN_DISAGREES')) {
    const reason = trimmed.slice('PLAN_DISAGREES'.length).trim();
    return { kind: 'plan-disagrees', reason: reason || 'unspecified' };
  }

  // Must look like a unified diff
  if (!trimmed.includes('---') && !trimmed.includes('+++') && !trimmed.startsWith('@@')) {
    return { kind: 'invalid', reason: 'Response is not a valid unified diff or sentinel' };
  }

  let files: ReturnType<typeof parseDiff>;
  try {
    files = parseDiff(trimmed);
  } catch (err) {
    return { kind: 'invalid', reason: `parse-diff threw: ${String(err)}` };
  }

  if (files.length === 0) {
    return { kind: 'invalid', reason: 'Unified diff parsed to zero files' };
  }

  return { kind: 'diff', raw: trimmed, files };
}
