/**
 * P1 fix coverage: hook event-shape normalisation handles both the
 * documented `tool_name/tool_input/tool_response` shape and the legacy
 * flat shape used by v0.1 wrappers.
 */
import { describe, it, expect } from 'vitest';
import { normaliseHookEvent } from '../../../src/hooks/eventShape.js';

describe('normaliseHookEvent', () => {
  it('reads documented Bash shape: tool_name + tool_input.command', () => {
    const r = normaliseHookEvent({
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      session_id: 's-1',
    });
    expect(r.tool).toBe('Bash');
    expect(r.command).toBe('ls -la');
    expect(r.sessionId).toBe('s-1');
  });

  it('reads documented Edit/Write shape: tool_input.file_path', () => {
    const r = normaliseHookEvent({
      tool_name: 'Edit',
      tool_input: { file_path: '/abs/foo.md' },
    });
    expect(r.tool).toBe('Edit');
    expect(r.filePath).toBe('/abs/foo.md');
  });

  it('reads legacy flat shape: tool + path', () => {
    const r = normaliseHookEvent({
      tool: 'Write',
      path: '/abs/bar.md',
      command: 'ignored',
      session_id: 's-2',
    });
    expect(r.tool).toBe('Write');
    expect(r.filePath).toBe('/abs/bar.md');
    expect(r.command).toBe('ignored');
    expect(r.sessionId).toBe('s-2');
  });

  it('documented shape takes precedence over legacy when both present', () => {
    const r = normaliseHookEvent({
      tool_name: 'Bash',
      tool: 'OldName',
      tool_input: { command: 'new' },
      command: 'old',
    });
    expect(r.tool).toBe('Bash');
    expect(r.command).toBe('new');
  });

  it('unknown shape returns empty fields', () => {
    const r = normaliseHookEvent({ random: 'thing' });
    expect(r.tool).toBeUndefined();
    expect(r.command).toBeUndefined();
    expect(r.filePath).toBeUndefined();
  });

  it('null/undefined input is safe', () => {
    expect(normaliseHookEvent(null)).toEqual({ raw: null });
    expect(normaliseHookEvent(undefined)).toEqual({ raw: undefined });
  });

  it('Q13: array input — fields undefined', () => {
    const r = normaliseHookEvent([]);
    expect(r.tool).toBeUndefined();
    expect(r.command).toBeUndefined();
  });

  it('Q13: tool_input non-object falls back to legacy command', () => {
    const r = normaliseHookEvent({
      tool_name: 'Bash',
      tool_input: 'not-an-object',
      command: 'fallback-cmd',
    });
    expect(r.tool).toBe('Bash');
    expect(r.command).toBe('fallback-cmd');
  });

  it('Q13: only numeric response_lines is honoured', () => {
    expect(normaliseHookEvent({ response_lines: 42 }).responseLines).toBe(42);
    expect(normaliseHookEvent({ response_lines: '42' }).responseLines).toBeUndefined();
    expect(normaliseHookEvent({ response_lines: null }).responseLines).toBeUndefined();
  });

  it('Q13: tool_input.path wins over top-level path', () => {
    const r = normaliseHookEvent({
      tool_name: 'Edit',
      tool_input: { path: '/tool/input/path' },
      path: '/legacy/path',
    });
    expect(r.filePath).toBe('/tool/input/path');
  });

  it('Q13: empty-string command preserved', () => {
    const r = normaliseHookEvent({
      tool_name: 'Bash',
      tool_input: { command: '' },
    });
    expect(r.command).toBe('');
  });

  it('Q13: non-object scalar input returns just raw', () => {
    expect(normaliseHookEvent('hi')).toEqual({ raw: 'hi' });
    expect(normaliseHookEvent(42)).toEqual({ raw: 42 });
  });
});
