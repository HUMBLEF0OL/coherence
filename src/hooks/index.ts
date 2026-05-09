/**
 * Hook registration entrypoint consumed by plugin.json.
 * TS-2 §2.1
 */
export { sessionStartHook } from './sessionStart.js';
export { postToolUseHook } from './postToolUse.js';
export { userPromptSubmitHook } from './userPromptSubmit.js';
export { subagentStopHook } from './subagentStop.js';
export { stopHook } from './stop.js';
export { sessionEndHook } from './sessionEnd.js';
export { preCompactHook } from './preCompact.js';
