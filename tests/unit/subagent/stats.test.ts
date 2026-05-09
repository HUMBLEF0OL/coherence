/**
 * Subagent stats threshold tests.
 * FR-LAYERS-3..4: refactor-bot example from TS-7 §7.4
 */
import { describe, it, expect } from 'vitest';
import { initialStats, addClassification, detectThresholds } from '../../../src/subagent/stats.js';

describe('subagent stats', () => {
  it('initializes with zeros', () => {
    const s = initialStats();
    expect(s.window_size).toBe(0);
    expect(s.accepted + s.edited + s.discarded + s.rejected).toBe(0);
  });

  it('tracks accepted + discarded + edited correctly', () => {
    let s = initialStats();
    for (let i = 0; i < 18; i++) s = addClassification(s, 'accepted');
    for (let i = 0; i < 5; i++) s = addClassification(s, 'edited');
    for (let i = 0; i < 27; i++) s = addClassification(s, 'discarded');
    expect(s.accepted).toBe(18);
    expect(s.edited).toBe(5);
    expect(s.discarded).toBe(27);
  });

  it('flags refactor-bot pattern from TS-7 §7.4 (accepted=18 edited=5 discarded=27 shift -22pp)', () => {
    let s = initialStats();
    for (let i = 0; i < 18; i++) s = addClassification(s, 'accepted');
    for (let i = 0; i < 5; i++) s = addClassification(s, 'edited');
    for (let i = 0; i < 27; i++) s = addClassification(s, 'discarded');

    // last5: mostly discarded (shift -22pp from prior10 baseline of accept-heavy)
    let last5 = initialStats();
    for (let i = 0; i < 5; i++) last5 = addClassification(last5, 'discarded');

    let prior10 = initialStats();
    for (let i = 0; i < 9; i++) prior10 = addClassification(prior10, 'accepted');
    prior10 = addClassification(prior10, 'discarded');

    const alerts = detectThresholds(s, last5, prior10);
    expect(alerts.some((a) => a.type === 'high-discard')).toBe(true);
  });

  it('detects sudden shift > 20pp', () => {
    let s = initialStats();
    s = addClassification(s, 'accepted');

    let last5 = initialStats();
    for (let i = 0; i < 5; i++) last5 = addClassification(last5, 'discarded'); // 100% discard

    let prior10 = initialStats();
    for (let i = 0; i < 10; i++) prior10 = addClassification(prior10, 'accepted'); // 0% discard

    const alerts = detectThresholds(s, last5, prior10);
    expect(alerts.some((a) => a.type === 'sudden-shift')).toBe(true);
  });
});
