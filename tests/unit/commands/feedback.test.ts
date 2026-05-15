/**
 * /coherence:feedback contract tests (S6).
 *
 * Captures a session bundle (version, mode, recent activity, redacted user
 * note) that pre-fills the GitHub tester-feedback issue template.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureFeedbackBundle } from '../../../src/commands/feedback.js';
import { makeStateStore } from '../../../src/state/init.js';
import { emitMetric } from '../../../src/state/metrics.js';

describe('captureFeedbackBundle', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'coherence-feedback-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('captures plugin version, mode, recent activity, and a user message', async () => {
    const bundle = await captureFeedbackBundle({
      projectRoot: tmp,
      userMessage: "auto-apply gate fired on a section it shouldn't have",
    });
    expect(bundle.pluginVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(bundle.userMessage).toContain('auto-apply gate');
    expect(typeof bundle.mode).toBe('string');
    expect(Array.isArray(bundle.recentActivity)).toBe(true);
    expect(bundle.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('redacts file paths outside the project root', async () => {
    const bundle = await captureFeedbackBundle({
      projectRoot: tmp,
      userMessage: 'check this: /Users/secret/.ssh/id_rsa',
    });
    expect(bundle.userMessage).not.toContain('/Users/secret');
    expect(bundle.userMessage).toContain('[redacted-path]');
  });

  it('tails the most recent metrics.jsonl entries (up to 10) without exposing payloads', async () => {
    const coherenceDir = path.join(tmp, '.claude', 'coherence');
    mkdirSync(coherenceDir, { recursive: true });
    const lines: string[] = [];
    for (let i = 0; i < 15; i++) {
      lines.push(
        JSON.stringify({
          event: 'patch_applied',
          session_id: 'sess',
          ts: `2026-05-15T00:00:${String(i).padStart(2, '0')}Z`,
          secret: 'do-not-leak',
        }),
      );
    }
    writeFileSync(path.join(coherenceDir, 'metrics.jsonl'), lines.join('\n') + '\n', 'utf8');

    const bundle = await captureFeedbackBundle({
      projectRoot: tmp,
      userMessage: 'nothing interesting',
    });
    expect(bundle.recentActivity.length).toBe(10);
    for (const entry of bundle.recentActivity) {
      expect(entry.kind).toBe('patch_applied');
      // Should not include arbitrary payload keys like `secret`.
      expect(JSON.stringify(entry)).not.toContain('do-not-leak');
    }
  });

  it('keeps the original path when it points inside the project root', async () => {
    const insidePath = path.join(tmp, 'docs', 'api.md');
    const bundle = await captureFeedbackBundle({
      projectRoot: tmp,
      userMessage: `touched ${insidePath} earlier`,
    });
    expect(bundle.userMessage).toContain(insidePath);
    expect(bundle.userMessage).not.toContain('[redacted-path]');
  });

  it("reads StateStore.appendJsonl's `_ts` field (regression: B1)", async () => {
    // Round-trip through the real writer so we lock in compatibility with
    // the `{ ...record, _ts: <iso> }` shape StateStore stamps onto every
    // line. Synthetic JSONL with a literal `ts:` field would have hidden
    // the original bug.
    mkdirSync(path.join(tmp, '.claude', 'coherence'), { recursive: true });
    const store = makeStateStore(tmp);
    await emitMetric(store, {
      event: 'patch_applied',
      session_id: 'sess',
      sectionRef: 'docs/api.md#intro' as never,
      changeClass: 'modifying' as never,
      prompt_version: { stage1: 'v2', stage2: 'v2' },
    });

    const bundle = await captureFeedbackBundle({
      projectRoot: tmp,
      userMessage: 'no paths',
    });
    expect(bundle.recentActivity.length).toBe(1);
    expect(bundle.recentActivity[0].kind).toBe('patch_applied');
    expect(bundle.recentActivity[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
