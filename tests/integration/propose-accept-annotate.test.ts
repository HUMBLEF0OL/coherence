/**
 * D2 fix coverage: annotate accept overwrites the source doc named in the
 * proposal manifest, not a fabricated `.claude/annotations/...` path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { ProposalStore } from '../../src/proposals/store.js';
import { runProposeAccept } from '../../src/commands/proposeAccept.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-anno-acc-'));
  const c = path.join(dir, '.claude', 'coherence');
  store = new StateStore(c, path.join(c, 'quarantine'));
  ProposalStore.resetSessionCount('s');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('D2 fix: annotate accept overwrites source doc', () => {
  it('accept lands the proposal at the manifest target_path, not a sibling dir', async () => {
    // Set up a source doc with no anchors.
    const docPath = path.join(dir, 'docs', 'guide.md');
    mkdirSync(path.dirname(docPath), { recursive: true });
    writeFileSync(docPath, '# Hi\n\nhi');

    const annotated = '<!-- coherence:section hi -->\n# Hi\n\nhi';
    const pstore = new ProposalStore(store);
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'annotate',
      signalHash: 'src-hash',
      signalKind: 'anchor_less_doc',
      artifact: { filename: 'PROPOSAL.md', content: annotated },
      sessionId: 's',
      targetPath: path.relative(dir, docPath),
    });
    expect(r.enqueued).toBe(true);

    const out = await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: r.manifest.proposal_id,
    });
    expect(out.accepted).toBe(true);
    // The source doc itself was overwritten — no .claude/annotations/ shadow file.
    expect(out.written_path).toBe(docPath);
    expect(readFileSync(docPath, 'utf8')).toBe(annotated);
    expect(existsSync(path.join(dir, '.claude', 'annotations'))).toBe(false);
  });
});
