/**
 * PostToolUse hook — detection + buffer append.
 * TS-4 §4.3 (steps 1-4, mid-session refresh in M5)
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, makeStateStore } from '../state/init.js';
import { PathFilter } from '../detection/pathFilter.js';
import { readFileSync, existsSync } from 'fs';
import { scanAnchors } from '../detection/anchorScanner.js';
import { hashContent } from '../buffer/contentHash.js';
import { BufferLifecycle } from '../buffer/lifecycle.js';
import { normalizePath, makeSectionRef } from '../state/pathNormaliser.js';
import type { BufferEntry, NormalizedPath } from '../types/index.js';
import { nowIsoUtc } from '../util/time.js';

interface PostToolUseEvent {
  tool?: string;
  path?: string;
  [key: string]: unknown;
}

const SUCCESS: HookResult = { success: true };

export async function postToolUseHook(
  event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    // Step 1: kill-switch (TS-4 §4.1)
    if (sentinels.isDisabled()) return SUCCESS;

    const evt = event as PostToolUseEvent;
    const filePath = evt.path;
    if (!filePath) return SUCCESS;

    // Step 2: path filter
    const filter = new PathFilter(projectRoot);
    if (!filter.isAllowed(filePath, projectRoot)) return SUCCESS;

    // Only process files that could contain coherence anchors
    if (!filePath.endsWith('.md')) return SUCCESS;

    // Step 3: read file and scan anchors
    if (!existsSync(filePath)) return SUCCESS;

    let source: string;
    try {
      source = readFileSync(filePath, 'utf8');
    } catch {
      return SUCCESS;
    }

    const { sections } = scanAnchors(source, filePath);
    if (sections.length === 0) return SUCCESS;

    // Step 4: append hash-only entries to buffer (NFR-PRIVACY-4)
    const store = makeStateStore(projectRoot);
    const buffer = new BufferLifecycle(store);
    const normalizedPath = normalizePath(filePath) as NormalizedPath;

    for (const section of sections) {
      const entry: BufferEntry = {
        path: normalizedPath,
        sectionRef: makeSectionRef(normalizedPath, section.id),
        contentHash: hashContent(section.content),
        triggeredAt: nowIsoUtc(),
        source: 'posttooluse',
      };
      await buffer.append(entry);
    }

    // Steps 5-6: mid-session refresh — deferred to M5

    return SUCCESS;
  });
}
