/**
 * YAML frontmatter parser for SKILL.md and agent files.
 * Rejects HTML coherence comments inside skill/agent body (DD-050, FR-LAYERS-2).
 */
import yaml from 'js-yaml';

export interface FrontmatterResult {
  data: Record<string, unknown> | null;
  body: string;
  error?: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const HTML_COHERENCE_RE = /<!--\s*coherence:/;

export function parseFrontmatter(source: string): FrontmatterResult {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) {
    return { data: null, body: source };
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = yaml.load(match[1]!) as Record<string, unknown>;
  } catch (e) {
    return { data: null, body: match[2] ?? '', error: String(e) };
  }

  return { data, body: match[2] ?? '' };
}

/** Validate that a skill/agent file body contains no HTML coherence anchors (DD-050). */
export function validateNoHtmlCoherenceAnchors(body: string, filePath: string): string[] {
  const warnings: string[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (HTML_COHERENCE_RE.test(lines[i]!)) {
      warnings.push(
        `HTML coherence anchor not allowed in skill/agent body: ${filePath}:${i + 1}`,
      );
    }
  }
  return warnings;
}
