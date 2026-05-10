/**
 * DD-065 quarantine boundary.
 *
 * The single load-bearing trust constraint of v0.2. Author and Annotate
 * proposals materialise *only* under `.claude/coherence/proposals/<kind>/<id>/`.
 * Net-new skill / agent / command files never reach `.claude/skills/`,
 * `.claude/agents/`, `.claude/commands/`, or `~/.claude/settings.json`
 * unless an explicit user-typed `/coherence:propose-accept <id>` runs the
 * `proposeAccept.ts` cross-the-boundary operator.
 *
 * The writer here refuses any path argument that does not resolve under the
 * quarantine prefix after realpath + normalisation (defence-in-depth against
 * traversal payloads that an LLM proposer might emit).
 *
 * TS-2 §4 — `propose-accept` is the single 'cross the boundary' operator.
 */
import { mkdirSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { getCoherenceDir } from '../state/init.js';

export type ProposalKind = 'skill' | 'slash_command' | 'agent' | 'annotate';

export interface QuarantineWriteResult {
  proposalDir: string;
  artifactPath: string;
}

export class QuarantineBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuarantineBoundaryError';
  }
}

/** Compute the absolute root of the quarantine area for a project. */
export function getProposalsRoot(projectRoot: string): string {
  return path.join(getCoherenceDir(projectRoot), 'proposals');
}

/**
 * Compute the absolute directory for a single proposal under quarantine.
 * Refuses any kind/id pair that would escape the quarantine prefix.
 */
export function getProposalDir(
  projectRoot: string,
  kind: ProposalKind,
  id: string,
): string {
  if (!/^[a-z0-9_-]+$/.test(id)) {
    throw new QuarantineBoundaryError(
      `proposal id '${id}' must match /^[a-z0-9_-]+$/`,
    );
  }
  const root = getProposalsRoot(projectRoot);
  const dir = path.resolve(root, kind, id);
  // Defence in depth: resolved dir must remain under quarantine root.
  const rel = path.relative(root, dir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new QuarantineBoundaryError(
      `proposal dir ${dir} escapes quarantine root ${root}`,
    );
  }
  return dir;
}

/**
 * Atomically write a proposal artifact under
 * `.claude/coherence/proposals/<kind>/<id>/<filename>`.
 *
 * Refuses any filename that contains a path separator or `..` segment.
 * Refuses any payload whose resolved path would escape quarantine.
 *
 * Uses the same temp+rename atomic-write contract as `stateStore.ts`.
 */
export function writeProposalArtifact(
  projectRoot: string,
  kind: ProposalKind,
  id: string,
  filename: string,
  content: string,
): QuarantineWriteResult {
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new QuarantineBoundaryError(
      `proposal filename '${filename}' must be a leaf name without separators or '..'`,
    );
  }
  const proposalDir = getProposalDir(projectRoot, kind, id);
  mkdirSync(proposalDir, { recursive: true });

  const artifactPath = path.resolve(proposalDir, filename);
  const rel = path.relative(proposalDir, artifactPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new QuarantineBoundaryError(
      `proposal artifact path ${artifactPath} escapes proposal dir ${proposalDir}`,
    );
  }

  const tmpPath = `${artifactPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmpPath, content, 'utf8');
    renameSync(tmpPath, artifactPath);
  } finally {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      /* best-effort */
    }
  }

  return { proposalDir, artifactPath };
}

/** Returns true iff `targetPath` resolves under the quarantine prefix. */
export function isUnderQuarantine(projectRoot: string, targetPath: string): boolean {
  const root = getProposalsRoot(projectRoot);
  const resolved = path.resolve(targetPath);
  const rel = path.relative(root, resolved);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}
