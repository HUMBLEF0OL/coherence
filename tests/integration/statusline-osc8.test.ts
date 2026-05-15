/**
 * Statusline OSC 8 / OSC 52 / plain three-tier graceful degradation
 * (DD-071, FR-STATUSLINE-9).
 */
import { describe, it, expect } from 'vitest';
import { renderClickAffordance } from '../../src/observability/statusline.js';

describe('renderClickAffordance (DD-071)', () => {
  it('renders OSC 8 when terminal_hyperlink === osc8', () => {
    const r = renderClickAffordance(
      '[2 proposals]',
      '/coherence:propose list',
      { terminal_hyperlink: 'osc8' },
      {},
    );
    expect(r.tier).toBe('osc8');
    expect(r.rendered).toContain('\x1b]8;;');
    expect(r.rendered).toContain('claude://run/coherence:propose list');
  });

  it('renders OSC 52 when terminal_hyperlink === osc52', () => {
    const r = renderClickAffordance(
      '[2 proposals]',
      '/coherence:propose list',
      { terminal_hyperlink: 'osc52' },
      {},
    );
    expect(r.tier).toBe('osc52');
    expect(r.rendered).toContain('\x1b]52;c;');
  });

  it('falls back to plain when terminal_hyperlink === plain', () => {
    const r = renderClickAffordance(
      '[2 proposals]',
      '/coherence:propose list',
      { terminal_hyperlink: 'plain' },
      {},
    );
    expect(r.tier).toBe('plain');
    expect(r.rendered).toBe('[2 proposals] → /coherence:propose list');
  });

  it('FORCE_HYPERLINK=1 lifts plain → osc8', () => {
    const r = renderClickAffordance(
      '[2 proposals]',
      '/coherence:propose list',
      { terminal_hyperlink: 'plain' },
      { FORCE_HYPERLINK: '1' },
    );
    expect(r.tier).toBe('osc8');
  });

  it('claude_url_scheme_supported wins over OSC 8', () => {
    const r = renderClickAffordance(
      '[2 proposals]',
      '/coherence:propose list',
      { terminal_hyperlink: 'osc8', claude_url_scheme_supported: true },
      {},
    );
    expect(r.tier).toBe('claude_url');
  });

  it('default capability (none) renders plain', () => {
    const r = renderClickAffordance(
      '[label]',
      '/coherence:propose list',
      {},
      {},
    );
    expect(r.tier).toBe('plain');
  });
});
