/**
 * Hook-event shape parsing (P1 fix).
 *
 * Claude Code's documented PostToolUse event carries
 * `{ tool_name, tool_input, tool_response }`. v0.1 hooks were written
 * against a flatter `{ tool, path, ... }` shape (some host wrappers
 * passed the unwrapped fields through). To work in both shapes, we
 * normalise here.
 *
 * Returns a uniform `{ tool, command?, filePath?, sessionId?, prompt?,
 * agentId?, responseLines? }` projection. Unknown shapes leave
 * fields undefined.
 */

export interface NormalisedHookEvent {
  tool?: string;
  command?: string;
  filePath?: string;
  sessionId?: string;
  prompt?: string;
  agentId?: string;
  responseLines?: number;
  raw: unknown;
}

interface ToolInputShape {
  command?: string;
  file_path?: string;
  filePath?: string;
  path?: string;
}

interface DocumentedShape {
  tool_name?: string;
  tool_input?: ToolInputShape;
  tool_response?: unknown;
  session_id?: string;
  prompt?: string;
  agent_id?: string;
  response_lines?: number;
}

interface LegacyShape {
  tool?: string;
  command?: string;
  path?: string;
  file_path?: string;
  session_id?: string;
  prompt?: string;
  agent_id?: string;
  response_lines?: number;
}

export function normaliseHookEvent(event: unknown): NormalisedHookEvent {
  if (!event || typeof event !== 'object') return { raw: event };
  const e = event as DocumentedShape & LegacyShape;

  // Tool name: documented `tool_name` wins; legacy `tool` is fallback.
  const tool = e.tool_name ?? e.tool;

  // Bash command: documented `tool_input.command` first, then legacy top-level.
  const command = e.tool_input?.command ?? e.command;

  // File path: documented `tool_input.file_path` (Edit/Write usually use
  // `file_path`), with `tool_input.path` and legacy fallbacks.
  const filePath =
    e.tool_input?.file_path ??
    e.tool_input?.filePath ??
    e.tool_input?.path ??
    e.path ??
    e.file_path;

  const result: NormalisedHookEvent = { raw: event };
  if (tool !== undefined) result.tool = tool;
  if (command !== undefined) result.command = command;
  if (filePath !== undefined) result.filePath = filePath;
  if (e.session_id !== undefined) result.sessionId = e.session_id;
  if (e.prompt !== undefined) result.prompt = e.prompt;
  if (e.agent_id !== undefined) result.agentId = e.agent_id;
  if (typeof e.response_lines === 'number') result.responseLines = e.response_lines;
  return result;
}
