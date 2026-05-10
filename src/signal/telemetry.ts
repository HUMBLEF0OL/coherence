/**
 * DD-068 telemetry emitter (G11 fix, FR-OBS-N1..N5).
 *
 * Privacy-safe-by-construction: only digest fields persisted. The three
 * core events:
 *   - tool_invocation_signature  (PostToolUse Bash/Edit/Write)
 *   - user_prompt_signature      (UserPromptSubmit)
 *   - agent_response_id          (Stop / SubagentStop)
 *
 * Length buckets / `refers_to_prior` heuristic per FR-OBS-N1c, N1d.
 * Cross-session leak guard: `responseCorrelation` is cleared at SessionStart
 * and SessionEnd (FR-OBS-N2).
 */
import type { StateStore } from '../state/stateStore.js';
import { emitMetric } from '../state/metrics.js';
import { signatureHash } from './signatureHash.js';
import {
  normaliseBashCommand,
  normaliseFilePath,
  lengthBucket,
  refersToPrior,
} from './normalize.js';

interface ResponseCorrelation {
  prior_response_id: string | null;
}

const correlation: ResponseCorrelation = { prior_response_id: null };

/** FR-OBS-N2 — clear cross-session correlation cache. */
export function clearResponseCorrelation(): void {
  correlation.prior_response_id = null;
}

export function _peekCorrelation(): string | null {
  return correlation.prior_response_id;
}

export interface EmitToolSigArgs {
  toolName: string;
  command?: string;
  filePath?: string;
}

/**
 * Emit DD-068 `tool_invocation_signature`. Bash commands are normalised;
 * file paths are templated. Read tool calls are excluded by the caller.
 */
export async function emitToolInvocationSignature(
  store: StateStore,
  sessionId: string,
  args: EmitToolSigArgs,
): Promise<void> {
  let signature: string;
  if (args.toolName === 'Bash' && args.command) {
    signature = signatureHash('tool_invocation', normaliseBashCommand(args.command));
  } else if ((args.toolName === 'Edit' || args.toolName === 'Write') && args.filePath) {
    signature = signatureHash('file_write_path', normaliseFilePath(args.filePath));
  } else {
    return; // Read excluded; unknown tool name skipped.
  }
  await emitMetric(store, {
    event: 'tool_invocation_signature',
    session_id: sessionId,
    tool: args.toolName,
    signature_hash: signature,
  });
}

export interface EmitPromptSigArgs {
  prompt: string;
}

export async function emitUserPromptSignature(
  store: StateStore,
  sessionId: string,
  args: EmitPromptSigArgs,
): Promise<void> {
  const len = args.prompt.length;
  const bucket = lengthBucket(len);
  const refers = refersToPrior(args.prompt);
  await emitMetric(store, {
    event: 'user_prompt_signature',
    session_id: sessionId,
    length_bucket: bucket,
    refers_to_prior: refers,
    prior_response_id: correlation.prior_response_id,
  });
}

export interface EmitAgentResponseArgs {
  agentId: string;
  /** Total lines of the agent's textual output. */
  responseLines: number;
}

export async function emitAgentResponseId(
  store: StateStore,
  sessionId: string,
  args: EmitAgentResponseArgs,
): Promise<void> {
  const id = signatureHash('agent_response', `${args.agentId}::${args.responseLines}`);
  correlation.prior_response_id = id;
  await emitMetric(store, {
    event: 'agent_response_id',
    session_id: sessionId,
    agent_id_hash: signatureHash('agent_response', args.agentId),
    response_id: id,
    length_bucket: lengthBucket(args.responseLines),
  });
}
