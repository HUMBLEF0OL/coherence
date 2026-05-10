/**
 * Author/Annotate proposal validator (M5).
 *
 * Two-phase (FR-AUTHOR-2):
 *   - generate-time: schema-validate Author output, refuse hallucinated paths,
 *     refuse prompt-injection patterns, refuse instruction-shaped HTML in body.
 *   - accept-time: re-validate the proposal artifact against `proposal.schema.json`
 *     before crossing the DD-065 boundary (lands in M7).
 */

export interface AuthorPayload {
  name: string;
  description: string;
  purpose?: string;
  usage?: string;
  frontmatter?: Record<string, unknown>;
  body_md?: string;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

const KEBAB_RE = /^[a-z][a-z0-9-]+$/;
const TRAVERSAL_RE = /(\.\.[\\/])|^[\\/]/;
const INSTRUCTION_HTML_RE =
  /<\s*script\b|<\s*iframe\b|<\s*object\b|<\s*embed\b|javascript:/i;
const PROMPT_INJECTION_RE =
  /(ignore (the )?(previous|all) instructions|disregard prior|system:\s*|<\s*system\s*>|jailbreak|exfiltrate)/i;

export function validateAuthorPayload(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'not_object' };
  const p = payload as AuthorPayload;
  if (typeof p.name !== 'string' || !KEBAB_RE.test(p.name)) {
    return { ok: false, reason: 'invalid_name' };
  }
  if (typeof p.description !== 'string' || p.description.length < 4 || p.description.length > 256) {
    return { ok: false, reason: 'invalid_description' };
  }
  if (p.frontmatter && typeof p.frontmatter !== 'object') {
    return { ok: false, reason: 'invalid_frontmatter' };
  }
  if (p.body_md && typeof p.body_md === 'string') {
    if (TRAVERSAL_RE.test(p.body_md)) return { ok: false, reason: 'path_traversal_in_body' };
    if (INSTRUCTION_HTML_RE.test(p.body_md)) return { ok: false, reason: 'instruction_html' };
    if (PROMPT_INJECTION_RE.test(p.body_md)) return { ok: false, reason: 'prompt_injection' };
  }
  return { ok: true };
}

/** Reject Author output literally containing only the NO_PROPOSAL sentinel. */
export function isNoProposal(text: string): boolean {
  return text.trim() === 'NO_PROPOSAL';
}
