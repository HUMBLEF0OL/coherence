/**
 * Mid-session refresh and UserPromptSubmit condition tests.
 * FR-MIDSESSION-1..4, NFR-COST-3
 */
import { describe, it, expect } from 'vitest';
import { createWindow, addMessage } from '../../../src/subagent/window.js';

describe('classifier window', () => {
  it('classifies discard from keywords', () => {
    let w = createWindow();
    w = addMessage(w, 'that was wrong');
    w = addMessage(w, 'please ignore those changes');
    expect(w.final_classification).toBe('discarded');
  });

  it('classifies edit from keywords', () => {
    let w = createWindow();
    w = addMessage(w, 'I edited and revised the API section');
    expect(w.final_classification).toBe('edited');
  });

  it('classifies accept from keywords', () => {
    let w = createWindow();
    w = addMessage(w, 'great work, apply it');
    expect(w.final_classification).toBe('accepted');
  });

  it('returns null with no signal', () => {
    const w = createWindow();
    expect(w.final_classification).toBeNull();
  });

  it('uses only last 2 messages', () => {
    let w = createWindow();
    w = addMessage(w, 'great job');
    w = addMessage(w, 'actually ignore all of that');
    expect(w.final_classification).toBe('discarded');
  });
});
