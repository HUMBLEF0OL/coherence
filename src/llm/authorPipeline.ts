/**
 * Author pipeline (M5, DD-067, FR-AUTHOR-1..5).
 *
 * Separate module from v0.1 stage1/stage2 — DD-067 explicitly forbids reuse.
 * Per-signal invocation: one signal in → one Author proposal out (or
 * NO_PROPOSAL literal).
 *
 * Cost partition: stage="author" in cost-ledger; prompt_version.author from
 * `prompts/v2/manifest.json`.
 */
import type { ProposalKind } from '../proposals/quarantine.js';
import type { SignalKind } from '../state/proposalCache.js';
import {
  validateAuthorPayload,
  isNoProposal,
  type AuthorPayload,
} from '../validation/proposalValidator.js';
import { llmCall, loadV2Prompt } from './client.js';

export interface AuthorInputEnvelope {
  signal_kind: SignalKind;
  signal_hash: string;
  signal_evidence: Record<string, unknown>;
  recent_context?: Record<string, unknown>;
}

export interface AuthorOutput {
  status: 'proposal' | 'no_proposal' | 'invalid';
  payload?: AuthorPayload;
  reason?: string;
  artifact?: { filename: string; content: string };
  kind: ProposalKind;
}

/**
 * Author LLM transport — abstracted for cassette/replay.
 * The default transport is `mockAuthorTransport` (deterministic, no API).
 */
export type AuthorTransport = (
  envelope: AuthorInputEnvelope,
  promptKey: 'author/skill.md' | 'author/slash-command.md' | 'author/agent.md',
) => Promise<string>;

/** Map signal kind → prompt + proposal kind. */
function routeSignal(signalKind: SignalKind): {
  promptKey: 'author/skill.md' | 'author/slash-command.md' | 'author/agent.md';
  kind: ProposalKind;
} {
  switch (signalKind) {
    case 'file_creation':
      return { promptKey: 'author/skill.md', kind: 'skill' };
    case 'bash_repetition':
      return { promptKey: 'author/slash-command.md', kind: 'slash_command' };
    case 'agent_correction':
      return { promptKey: 'author/agent.md', kind: 'agent' };
    case 'anchor_less_doc':
      // Annotate flow handled separately in M6.
      return { promptKey: 'author/skill.md', kind: 'annotate' };
  }
}

function frontmatterBlock(p: AuthorPayload): string {
  if (!p.frontmatter) return '';
  const lines = ['---'];
  for (const [k, v] of Object.entries(p.frontmatter)) {
    lines.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function renderArtifact(payload: AuthorPayload, kind: ProposalKind): {
  filename: string;
  content: string;
} {
  const front = frontmatterBlock(payload);
  const body = payload.body_md ?? '';
  const purpose = payload.purpose ?? '';
  const usage = payload.usage ?? '';
  const md = `${front}# ${payload.description}\n\n${purpose}\n\n${body}\n\n${usage ? `## Usage\n\n${usage}\n` : ''}`;
  const filename =
    kind === 'skill' ? 'SKILL.md' : kind === 'agent' ? 'AGENT.md' : `${payload.name}.md`;
  return { filename, content: md };
}

export async function runAuthorPipeline(
  envelope: AuthorInputEnvelope,
  transport: AuthorTransport,
): Promise<AuthorOutput> {
  const { promptKey, kind } = routeSignal(envelope.signal_kind);
  const raw = await transport(envelope, promptKey);
  if (isNoProposal(raw)) {
    return { status: 'no_proposal', kind };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid', reason: 'unparseable_json', kind };
  }
  const v = validateAuthorPayload(parsed);
  if (!v.ok) {
    const out: AuthorOutput = { status: 'invalid', kind };
    if (v.reason) out.reason = v.reason;
    return out;
  }
  const payload = parsed as AuthorPayload;
  return {
    status: 'proposal',
    payload,
    artifact: renderArtifact(payload, kind),
    kind,
  };
}

/**
 * Deterministic test transport. Returns canned JSON for known signal kinds
 * unless the envelope.signal_evidence carries a `mock_response` override.
 */
export const mockAuthorTransport: AuthorTransport = async (envelope) => {
  const override = (envelope.signal_evidence as { mock_response?: string }).mock_response;
  if (override !== undefined) return override;
  const base = {
    name: `auto-${envelope.signal_kind.replace(/_/g, '-')}`,
    description: `Auto-generated proposal for ${envelope.signal_kind}`,
    purpose: 'Reduce repetition observed in this session.',
    usage: 'Invoke when the signal recurs.',
    frontmatter: {
      name: `auto-${envelope.signal_kind.replace(/_/g, '-')}`,
      description: `Auto-generated proposal for ${envelope.signal_kind}`,
    },
    body_md: '*body*',
  };
  return JSON.stringify(base);
};

/**
 * D6 fix: live Author transport. Loads the v0.2 prompt + manifest, calls the
 * Anthropic SDK via the v0.1 cassette-aware `llmCall` wrapper. Cost-ledger
 * partition `stage: "author"` per DD-091.
 *
 * NOT exported as the default transport; opt-in via `runAuthorPipelineLive`
 * because tests should keep using `mockAuthorTransport` for determinism.
 */
export const liveAuthorTransport: AuthorTransport = async (envelope, promptKey) => {
  const systemPrompt = loadV2Prompt(promptKey);
  const userMessage = JSON.stringify(envelope, null, 2);
  const cassetteId = `author/${envelope.signal_kind}/${envelope.signal_hash}`;
  const response = await llmCall({
    stage: 'author',
    systemPrompt,
    userMessage,
    cassetteId,
  });
  return response.content;
};
