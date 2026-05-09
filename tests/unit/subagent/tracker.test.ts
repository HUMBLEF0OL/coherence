/**
 * Subagent tracker unit tests.
 * FR-DETECT-7..8, line-level + file-level fallback
 */
import { describe, it, expect } from 'vitest';
import { captureProvenance } from '../../../src/subagent/tracker.js';
import type { HostCapabilities } from '../../../src/types/index.js';

const LINE_LEVEL_CAPS: HostCapabilities = {
  subagent_attribution: true,
  frontmatter_preserves_unknown_keys: true,
  hook_event_shapes: { SubagentStop: 'v1' },
  token_count_in_posttooluse: false,
};

const FILE_LEVEL_CAPS: HostCapabilities = {
  subagent_attribution: false,
  frontmatter_preserves_unknown_keys: false,
  hook_event_shapes: {},
  token_count_in_posttooluse: false,
};

describe('subagent tracker', () => {
  it('captures line-level provenance when host supports attribution', () => {
    const event = {
      invocation_id: 'inv-001',
      session_id: 'session-1',
      tool_calls: [
        { path: 'docs/api.md', lines_added: 10, lines_removed: 3 },
        { path: 'CLAUDE.md', lines_added: 5, lines_removed: 0 },
      ],
    };

    const attribution = captureProvenance(event, LINE_LEVEL_CAPS);
    expect(attribution.invocation_id).toBe('inv-001');
    expect(attribution.files_touched).toContain('docs/api.md');
    expect(attribution.lines_added).toBe(15);
    expect(attribution.lines_removed).toBe(3);
  });

  it('uses file-level fallback when host lacks attribution', () => {
    const event = { session_id: 'session-2' };
    const attribution = captureProvenance(event, FILE_LEVEL_CAPS);
    expect(attribution.invocation_id).toMatch(/^file-level-/);
    expect(attribution.lines_added).toBeUndefined();
  });

  it('defaults classification to accepted', () => {
    const attribution = captureProvenance({}, FILE_LEVEL_CAPS);
    expect(attribution.classification).toBe('accepted');
  });
});
