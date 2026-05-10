/**
 * Agent-correction signal (DD-078 amended, OQ-v2-24).
 */
import { describe, it, expect } from 'vitest';
import { detectAgentCorrection } from '../../../src/signal/agentCorrection.js';

describe('detectAgentCorrection', () => {
  it('fires when ≥3 corrections across the 7-day window with aggregate ratio ≥ 0.20', () => {
    const samples = [
      { agent_id: 'foo', at: '2026-05-08T10:00:00Z', lines_changed: 5, total_lines: 10 },
      { agent_id: 'foo', at: '2026-05-09T10:00:00Z', lines_changed: 5, total_lines: 10 },
      { agent_id: 'foo', at: '2026-05-09T11:00:00Z', lines_changed: 5, total_lines: 10 },
    ];
    const r = detectAgentCorrection(samples, 'foo', new Date('2026-05-10T10:00:00Z'));
    expect(r.fired).toBe(true);
    expect(r.occurrences_in_window).toBe(3);
  });

  it('does not fire if aggregate ratio < threshold', () => {
    const samples = [
      { agent_id: 'foo', at: '2026-05-08T10:00:00Z', lines_changed: 1, total_lines: 100 },
      { agent_id: 'foo', at: '2026-05-09T10:00:00Z', lines_changed: 1, total_lines: 100 },
      { agent_id: 'foo', at: '2026-05-09T11:00:00Z', lines_changed: 1, total_lines: 100 },
    ];
    const r = detectAgentCorrection(samples, 'foo', new Date('2026-05-10T10:00:00Z'));
    expect(r.fired).toBe(false);
  });

  it('respects 7-day window', () => {
    const samples = [
      { agent_id: 'foo', at: '2026-04-01T10:00:00Z', lines_changed: 5, total_lines: 10 },
      { agent_id: 'foo', at: '2026-04-02T10:00:00Z', lines_changed: 5, total_lines: 10 },
      { agent_id: 'foo', at: '2026-04-03T10:00:00Z', lines_changed: 5, total_lines: 10 },
    ];
    const r = detectAgentCorrection(samples, 'foo', new Date('2026-05-10T10:00:00Z'));
    expect(r.fired).toBe(false);
    expect(r.occurrences_in_window).toBe(0);
  });

  it('isolates per-agent (signal does not bleed across agents)', () => {
    const samples = [
      { agent_id: 'foo', at: '2026-05-09T10:00:00Z', lines_changed: 5, total_lines: 10 },
      { agent_id: 'bar', at: '2026-05-09T10:00:00Z', lines_changed: 5, total_lines: 10 },
      { agent_id: 'bar', at: '2026-05-09T11:00:00Z', lines_changed: 5, total_lines: 10 },
    ];
    const r = detectAgentCorrection(samples, 'foo', new Date('2026-05-10T10:00:00Z'));
    expect(r.occurrences_in_window).toBe(1);
    expect(r.fired).toBe(false);
  });
});
