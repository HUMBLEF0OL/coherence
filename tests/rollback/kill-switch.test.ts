/**
 * RB-2: Manual kill-switch and auto-disable → every hook returns success without I/O / LLM.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { Sentinels } from '../../src/state/sentinels.js';
import { sessionStartHook } from '../../src/hooks/sessionStart.js';
import { postToolUseHook } from '../../src/hooks/postToolUse.js';
import { stopHook } from '../../src/hooks/stop.js';

function makeProjectRoot(): string {
  const root = path.join(tmpdir(), `coherence-ks-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path.join(root, '.claude', 'coherence'), { recursive: true });
  return root;
}

describe('kill-switch sentinels (RB-2)', () => {
  let projectRoot: string;
  let coherenceDir: string;

  beforeEach(() => {
    projectRoot = makeProjectRoot();
    coherenceDir = path.join(projectRoot, '.claude', 'coherence');
  });

  it('DISABLED (manual) makes SessionStart return success without I/O', async () => {
    writeFileSync(path.join(coherenceDir, 'DISABLED'), 'manual disable');
    const result = await sessionStartHook({}, projectRoot);
    expect(result.success).toBe(true);
  });

  it('auto-disabled makes PostToolUse return success without I/O', async () => {
    const sentinels = new Sentinels(coherenceDir);
    sentinels.setAutoDisabled('test auto-disable');
    const result = await postToolUseHook({}, projectRoot);
    expect(result.success).toBe(true);
  });

  it('auto-disabled makes Stop hook return success', async () => {
    const sentinels = new Sentinels(coherenceDir);
    sentinels.setAutoDisabled('test auto-disable');
    const result = await stopHook({}, projectRoot);
    expect(result.success).toBe(true);
  });

  it('recover clears auto-disabled but not manual DISABLED', () => {
    const sentinels = new Sentinels(coherenceDir);
    writeFileSync(path.join(coherenceDir, 'DISABLED'), 'manual');
    sentinels.setAutoDisabled('auto crash');

    sentinels.clearAutoDisabled();

    expect(sentinels.isManuallyDisabled()).toBe(true);
    expect(sentinels.isAutoDisabled()).toBe(false);
    expect(sentinels.isDisabled()).toBe(true); // DISABLED still present
  });
});
