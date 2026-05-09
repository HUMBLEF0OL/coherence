/**
 * Prompt injection rejection for skill/agent diffs.
 * NFR-SECURITY-7, FR-LAYERS-2, DD-043
 */

// Instruction-shaped patterns to reject in added lines (applied to all files)
const INSTRUCTION_PATTERNS = [
  /you\s+are\b/i,
  /ignore\s+(?:the\s+|all\s+)?(?:previous|prior)\s+instructions/i,
];

// HTML comment in skill/agent body (frontmatter excluded)
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/;

export interface InjectionCheckResult {
  rejected: boolean;
  reason: string | null;
}

/**
 * Check a diff for prompt injection patterns.
 * @param diffRaw - The raw unified diff text
 * @param isSkillOrAgent - Whether the target file is a SKILL.md or agent file
 */
export function checkPromptInjection(
  diffRaw: string,
  isSkillOrAgent: boolean,
): InjectionCheckResult {
  // Extract only the added lines from the diff
  const addedLines = diffRaw
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));

  const addedContent = addedLines.join('\n');

  if (isSkillOrAgent) {
    // Reject new HTML comments in skill/agent body
    if (HTML_COMMENT_RE.test(addedContent)) {
      return {
        rejected: true,
        reason: 'Diff introduces new HTML comment in skill/agent body (NFR-SECURITY-7)',
      };
    }
  }

  // Always reject instruction-shaped patterns in added lines
  for (const pattern of INSTRUCTION_PATTERNS) {
    if (pattern.test(addedContent)) {
      return {
        rejected: true,
        reason: `Diff contains instruction-shaped content matching ${pattern.source} (NFR-SECURITY-7)`,
      };
    }
  }

  // Reject coherence: frontmatter key alterations (DD-043, FR-LAYERS-2)
  if (/^[+-]\s*coherence:/m.test(diffRaw)) {
    return {
      rejected: true,
      reason: 'Diff alters coherence: frontmatter key (FR-LAYERS-2, DD-043)',
    };
  }

  return { rejected: false, reason: null };
}

export function isSkillOrAgentPath(filePath: string): boolean {
  return /SKILL\.md$/i.test(filePath) || /\.claude[/\\]agents[/\\]/i.test(filePath);
}
