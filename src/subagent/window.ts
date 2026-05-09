/**
 * 2-message keyword classifier window.
 * FR-DETECT-16: classify based on last 2 user messages mentioning the subagent output.
 */
import type { SubagentClassification } from './tracker.js';

const EDIT_KEYWORDS = ['changed', 'modified', 'updated', 'edited', 'revised', 'fixed'];
const DISCARD_KEYWORDS = ['ignore', 'discard', 'revert', 'undo', 'no', 'reject', 'wrong'];
const ACCEPT_KEYWORDS = ['good', 'great', 'thanks', 'perfect', 'yes', 'apply', 'accepted', 'merged'];

export interface ClassifierWindow {
  messages: string[];
  final_classification: SubagentClassification | null;
}

export function createWindow(): ClassifierWindow {
  return { messages: [], final_classification: null };
}

export function addMessage(window: ClassifierWindow, message: string): ClassifierWindow {
  const updated = {
    ...window,
    messages: [...window.messages.slice(-1), message], // keep last 2
  };
  return { ...updated, final_classification: classify(updated.messages) };
}

function classify(messages: string[]): SubagentClassification | null {
  const text = messages.join(' ').toLowerCase();

  if (DISCARD_KEYWORDS.some((kw) => text.includes(kw))) return 'discarded';
  if (EDIT_KEYWORDS.some((kw) => text.includes(kw))) return 'edited';
  if (ACCEPT_KEYWORDS.some((kw) => text.includes(kw))) return 'accepted';

  return null; // no clear signal yet
}
