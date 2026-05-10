/**
 * R9 fix coverage: doctor terminal-hyperlink heuristic. Each branch of
 * probeTerminalHyperlink should map to the right tier.
 */
import { describe, it, expect } from 'vitest';
import { probeTerminalHyperlink } from '../../../src/commands/doctor.js';

describe('R9: probeTerminalHyperlink', () => {
  it('FORCE_HYPERLINK=1 forces osc8', () => {
    expect(probeTerminalHyperlink({ FORCE_HYPERLINK: '1' })).toBe('osc8');
  });

  it('Windows Terminal (WT_SESSION) → osc8', () => {
    expect(probeTerminalHyperlink({ WT_SESSION: 'guid' })).toBe('osc8');
  });

  it('Konsole (KONSOLE_VERSION) → osc8', () => {
    expect(probeTerminalHyperlink({ KONSOLE_VERSION: '230400' })).toBe('osc8');
  });

  it('Tilix (TILIX_ID) → osc8', () => {
    expect(probeTerminalHyperlink({ TILIX_ID: 'foo' })).toBe('osc8');
  });

  it('GNOME / xfce4 (VTE_VERSION ≥ 5000) → osc8', () => {
    expect(probeTerminalHyperlink({ VTE_VERSION: '5202' })).toBe('osc8');
  });

  it('VTE_VERSION below 5000 → plain (heuristic falls through)', () => {
    expect(probeTerminalHyperlink({ VTE_VERSION: '4900' })).toBe('plain');
  });

  it('iTerm.app (TERM_PROGRAM) → osc8', () => {
    expect(probeTerminalHyperlink({ TERM_PROGRAM: 'iTerm.app' })).toBe('osc8');
  });

  it('VS Code (TERM_PROGRAM=vscode) → osc8', () => {
    expect(probeTerminalHyperlink({ TERM_PROGRAM: 'vscode' })).toBe('osc8');
  });

  it('Apple Terminal → osc52', () => {
    expect(probeTerminalHyperlink({ TERM_PROGRAM: 'Apple_Terminal' })).toBe('osc52');
  });

  it('xterm-kitty TERM → osc8', () => {
    expect(probeTerminalHyperlink({ TERM: 'xterm-kitty' })).toBe('osc8');
  });

  it('unknown environment → plain', () => {
    expect(probeTerminalHyperlink({})).toBe('plain');
  });

  it('FORCE_HYPERLINK=0 / missing → fall through to detection', () => {
    expect(probeTerminalHyperlink({ FORCE_HYPERLINK: '0' })).toBe('plain');
  });
});
