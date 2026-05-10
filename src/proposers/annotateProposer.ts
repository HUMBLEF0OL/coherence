/**
 * Annotate proposer (M6, DD-069, DD-073, FR-ANNOTATE-1..N).
 *
 * Anchor-less doc detection: a markdown doc with no v0.1 anchors and no
 * `coherence:` frontmatter receives a proposal that places anchors above
 * each heading and adds `auto-annotated: true` (or sidecar fallback if the
 * host strips unknown frontmatter keys).
 *
 * The proposer is deterministic: it does not call an LLM. The anchor IDs
 * are derived from heading text via the v0.1 path normaliser
 * (`normalizeSectionId`) so they round-trip through `coherence:doctor`.
 */
import { normalizeSectionId } from '../state/pathNormaliser.js';

const ANCHOR_RE = /<!--\s*coherence:section\s+([a-z0-9_-]+)\s*-->/i;

export interface AnnotateInput {
  /** Doc body (markdown). */
  body: string;
  /** Doc basename for the proposed kebab name. */
  basename: string;
  /** Whether the host preserves unknown frontmatter keys (DD-069 sidecar fallback). */
  preservesUnknownFrontmatter: boolean;
}

export interface AnnotateAnchor {
  line: number; // 1-indexed
  id: string;
  heading: string;
}

export interface AnnotateProposal {
  status: 'proposal' | 'no_proposal';
  reason?: string;
  name: string;
  anchors: AnnotateAnchor[];
  body_md: string;
  /** When `preservesUnknownFrontmatter`, this is the inline frontmatter. */
  frontmatter?: { 'auto-annotated': true };
  /** When sidecar fallback applies, this is the sidecar manifest. */
  sidecar?: { auto_annotated: true; anchors: AnnotateAnchor[] };
}

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;

export function proposeAnnotate(input: AnnotateInput): AnnotateProposal {
  const lines = input.body.split(/\r?\n/);
  const hasAnchor = lines.some((l) => ANCHOR_RE.test(l));
  const hasFrontmatterAnchor = /^---\s*$[\s\S]*?\bauto-annotated\b[\s\S]*?^---\s*$/m.test(
    input.body,
  );
  if (hasAnchor || hasFrontmatterAnchor) {
    return {
      status: 'no_proposal',
      reason: 'already_annotated',
      name: input.basename,
      anchors: [],
      body_md: input.body,
    };
  }

  const anchors: AnnotateAnchor[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const id = normalizeSectionId(m[2]);
    if (!id) continue;
    anchors.push({ line: i + 1, heading: m[2], id });
  }

  if (anchors.length === 0) {
    return {
      status: 'no_proposal',
      reason: 'no_headings',
      name: input.basename,
      anchors,
      body_md: input.body,
    };
  }

  // Insert anchor comments above each heading. Walk in reverse so line indices
  // stay valid as we splice.
  const out = [...lines];
  for (let i = anchors.length - 1; i >= 0; i--) {
    const a = anchors[i];
    out.splice(a.line - 1, 0, `<!-- coherence:section ${a.id} -->`);
  }

  const proposal: AnnotateProposal = {
    status: 'proposal',
    name: normalizeSectionId(input.basename) || 'auto-annotated',
    anchors,
    body_md: out.join('\n'),
  };

  if (input.preservesUnknownFrontmatter) {
    proposal.frontmatter = { 'auto-annotated': true };
  } else {
    proposal.sidecar = { auto_annotated: true, anchors };
  }

  return proposal;
}
