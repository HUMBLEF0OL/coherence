/**
 * /coherence:propose-accept <id> (M7, DD-082, FR-PROPOSE-10).
 *
 * The second cross-the-boundary operator (alongside install-statusline).
 * Steps:
 *   (a) read proposal artifact + manifest from quarantine
 *   (b) re-run proposalValidator (defence-in-depth)
 *   (c) collision policy: refuse if target path already exists, suggest a
 *       suffixed alternative (`SKILL.md` → `SKILL-2.md`).
 *   (d) `--rename` flag: suffix and write
 *   (e) `--overwrite <retyped-path>` flag: quarantine existing then write
 *   (f) write file at target path (atomic temp+rename)
 *   (g) transition state to accepted; emit `proposal_accepted`
 *   (h) (optional) git commit `[coherence] accept proposal <id> (...)`
 */
import {
  existsSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  copyFileSync,
  unlinkSync,
  readdirSync,
  readFileSync,
} from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import { ProposalStore } from '../proposals/store.js';
import {
  PROPOSE_ACCEPT_INVOCATION_TOKEN,
  loadProposalArtifact,
} from '../permissions/proposeAccept.js';
import { getProposalDir, type ProposalKind } from '../proposals/quarantine.js';
import { emitMetric } from '../state/metrics.js';
import { lockManager } from '../state/locks.js';
import { getCoherenceDir } from '../state/init.js';

export interface ProposeAcceptCmdArgs {
  store: StateStore;
  projectRoot: string;
  proposalId: string;
  sessionId?: string;
  rename?: boolean;
  /** When set, must equal the existing-target path (retyped by the user). */
  overwriteRetypedPath?: string;
  /** Override default target-path resolver (used by tests / agents). */
  targetPathFor?: (kind: ProposalKind, proposalId: string, artifactFilename: string) => string;
}

export interface ProposeAcceptCmdResult {
  accepted: boolean;
  reason?:
    | 'not_found'
    | 'name_collision'
    | 'illegal_state'
    | 'artifact_missing'
    | 'overwrite_mismatch'
    | 'path_escape';
  blocked_existing_path?: string;
  suggestion?: string;
  written_path?: string;
  rendered: string;
}

const KIND_DIRS: ProposalKind[] = ['skill', 'slash_command', 'agent', 'annotate'];

function defaultTargetFor(
  projectRoot: string,
  kind: ProposalKind,
  proposalId: string,
  filename: string,
  manifestTargetPath?: string,
): string {
  // D2 fix: annotate kind overwrites the source doc the manifest points at,
  // not a sibling directory.
  if (kind === 'annotate') {
    if (manifestTargetPath) {
      return path.join(projectRoot, manifestTargetPath);
    }
    // Fallback (legacy / corrupt manifest): refuse by routing to a sentinel
    // path that propose-accept will reject as a path_escape via no manifest.
    return path.join(projectRoot, '.claude', 'annotations', proposalId, filename);
  }
  const sub =
    kind === 'skill'
      ? path.join('.claude', 'skills', proposalId, filename)
      : kind === 'agent'
      ? path.join('.claude', 'agents', proposalId, filename)
      : path.join('.claude', 'commands', filename);
  return path.join(projectRoot, sub);
}

/** E8: bound the suffix scan so a pathological dir cannot stall accept. */
const SUFFIX_SCAN_CAP = 128;

function suffixed(targetPath: string): string {
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  let i = 2;
  while (i < SUFFIX_SCAN_CAP && existsSync(path.join(dir, `${base}-${i}${ext}`))) i += 1;
  return path.join(dir, `${base}-${i}${ext}`);
}

interface PluginJson {
  slashCommands?: Array<{ name: string; description?: string; handler?: string }>;
  [key: string]: unknown;
}

/**
 * D7: register an accepted slash_command proposal in plugin.json.
 * The proposed artifact is `.claude/commands/<name>.md`. The slash command
 * `name` is derived from the markdown filename without the `.md` extension,
 * prefixed `coherence:` to match the v0.1 namespace.
 */
function registerSlashCommand(
  projectRoot: string,
  writtenPath: string,
  proposalId: string,
): void {
  const pluginJsonPath = path.join(projectRoot, 'plugin.json');
  if (!existsSync(pluginJsonPath)) {
    throw new Error(`plugin.json not found at ${pluginJsonPath}`);
  }
  const raw = readFileSync(pluginJsonPath, 'utf8');
  const plugin = JSON.parse(raw) as PluginJson;
  const commands = Array.isArray(plugin.slashCommands) ? plugin.slashCommands : [];

  const baseName = path.basename(writtenPath, path.extname(writtenPath));
  const cmdName = baseName.startsWith('coherence:') ? baseName : `coherence:${baseName}`;
  if (commands.some((c) => c.name === cmdName)) {
    return; // already registered
  }
  commands.push({
    name: cmdName,
    description: `Accepted proposal ${proposalId}`,
    handler: `commands/${baseName}`,
  });
  plugin.slashCommands = commands;

  // Atomic temp+rename — same contract as stateStore.write.
  const tmp = `${pluginJsonPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(plugin, null, 2) + '\n', 'utf8');
  try {
    renameSync(tmp, pluginJsonPath);
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best-effort */
    }
  }
}

export async function runProposeAccept(
  args: ProposeAcceptCmdArgs,
): Promise<ProposeAcceptCmdResult> {
  // E9: serialise concurrent accepts on the same coherence dir to avoid
  // race conditions on proposal-cache.json read-mutate-write.
  const lockTarget = path.join(getCoherenceDir(args.projectRoot), '.propose-accept.target');
  const acquired = await lockManager.acquire(lockTarget, 'propose-accept');
  if (!acquired) {
    return {
      accepted: false,
      reason: 'illegal_state',
      rendered: `[coherence] propose-accept: lock unavailable (another accept in progress)`,
    };
  }
  try {
    return await runProposeAcceptLocked(args);
  } finally {
    lockManager.release(lockTarget);
  }
}

async function runProposeAcceptLocked(
  args: ProposeAcceptCmdArgs,
): Promise<ProposeAcceptCmdResult> {
  const pstore = new ProposalStore(args.store);
  const cache = await pstore.list();
  const entry = cache.entries.find((e) => e.proposal_id === args.proposalId);
  if (!entry) {
    return {
      accepted: false,
      reason: 'not_found',
      rendered: `[coherence] propose-accept: not found ${args.proposalId}`,
    };
  }
  if (entry.state !== 'surfaced' && entry.state !== 'queued') {
    return {
      accepted: false,
      reason: 'illegal_state',
      rendered: `[coherence] propose-accept: cannot accept from ${entry.state}`,
    };
  }
  // Locate the kind directory.
  let kind: ProposalKind | null = null;
  for (const k of KIND_DIRS) {
    if (existsSync(getProposalDir(args.projectRoot, k, args.proposalId))) {
      kind = k;
      break;
    }
  }
  if (!kind) {
    return {
      accepted: false,
      reason: 'artifact_missing',
      rendered: `[coherence] propose-accept: artifact missing for ${args.proposalId}`,
    };
  }
  const proposalDir = getProposalDir(args.projectRoot, kind, args.proposalId);
  // Pick the first non-manifest filename.
  const filenames = readdirSync(proposalDir).filter((f) => f !== 'manifest.json');
  if (filenames.length === 0) {
    return {
      accepted: false,
      reason: 'artifact_missing',
      rendered: `[coherence] propose-accept: empty artifact dir`,
    };
  }
  const filename = filenames[0];

  // Load artifact via the cross-the-boundary loader (token-gated).
  const body = loadProposalArtifact({
    token: PROPOSE_ACCEPT_INVOCATION_TOKEN,
    projectRoot: args.projectRoot,
    kind,
    proposalId: args.proposalId,
    artifactFilename: filename,
    targetPath: '',
  });

  // D2 fix: read the manifest's target_path; for kind=annotate it points at
  // the source doc that must be overwritten.
  let manifestTargetPath: string | undefined;
  try {
    const manifestRaw = readFileSync(path.join(proposalDir, 'manifest.json'), 'utf8');
    const m = JSON.parse(manifestRaw) as { target_path?: string };
    if (typeof m.target_path === 'string' && m.target_path.length > 0) {
      manifestTargetPath = m.target_path;
    }
  } catch {
    /* manifest unreadable — fall through to default mapping */
  }

  const computeTarget = args.targetPathFor ?? ((k: ProposalKind, id: string, f: string): string =>
    defaultTargetFor(args.projectRoot, k, id, f, manifestTargetPath));
  const targetPath = computeTarget(kind, args.proposalId, filename);

  // Defence-in-depth: target path must remain inside projectRoot.
  const rel = path.relative(args.projectRoot, targetPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return {
      accepted: false,
      reason: 'path_escape',
      rendered: `[coherence] propose-accept: refused (target outside project)`,
    };
  }

  let writePath = targetPath;
  // D2: annotate-kind accepts always overwrite the source doc named in the
  // manifest. The "collision" is intentional — the proposal's purpose is to
  // replace the file with an anchored version. Quarantine the original first
  // for safety (mirrors --overwrite path).
  if (kind === 'annotate' && manifestTargetPath && existsSync(targetPath)) {
    const quarantineDir = path.join(args.projectRoot, '.claude', 'coherence', 'quarantine');
    mkdirSync(quarantineDir, { recursive: true });
    const bak = path.join(quarantineDir, `${path.basename(targetPath)}.${Date.now()}.bak`);
    copyFileSync(targetPath, bak);
  } else if (existsSync(targetPath)) {
    if (args.rename) {
      writePath = suffixed(targetPath);
    } else if (args.overwriteRetypedPath !== undefined) {
      if (args.overwriteRetypedPath !== targetPath) {
        return {
          accepted: false,
          reason: 'overwrite_mismatch',
          blocked_existing_path: targetPath,
          rendered: `[coherence] propose-accept: --overwrite path does not match existing target`,
        };
      }
      // Quarantine the existing file before overwriting.
      const quarantineDir = path.join(
        args.projectRoot,
        '.claude',
        'coherence',
        'quarantine',
      );
      mkdirSync(quarantineDir, { recursive: true });
      const bak = path.join(
        quarantineDir,
        `${path.basename(targetPath)}.${Date.now()}.bak`,
      );
      copyFileSync(targetPath, bak);
    } else {
      const suggestion = suffixed(targetPath);
      await emitMetric(args.store, {
        event: 'proposal_acceptance_blocked',
        session_id: args.sessionId ?? 'session',
        proposal_id: args.proposalId,
        reason: 'name_collision',
      });
      return {
        accepted: false,
        reason: 'name_collision',
        blocked_existing_path: targetPath,
        suggestion,
        rendered: `[coherence] propose-accept: name collision at ${path.relative(
          args.projectRoot,
          targetPath,
        )}; rerun with --rename to write to ${path.relative(
          args.projectRoot,
          suggestion,
        )} or --overwrite ${targetPath} to replace.`,
      };
    }
  }

  // Cross-the-boundary write (atomic temp+rename).
  mkdirSync(path.dirname(writePath), { recursive: true });
  const tmp = `${writePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, body, 'utf8');
  try {
    renameSync(tmp, writePath);
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best-effort */
    }
  }

  // D7 fix: slash_command accept must register the new command in
  // plugin.json so Claude Code surfaces it. The plugin.json edit lands
  // through the same atomic temp+rename contract.
  if (kind === 'slash_command') {
    try {
      registerSlashCommand(args.projectRoot, writePath, args.proposalId);
    } catch (err) {
      // If registration fails, the markdown file still landed but the
      // command is invisible. Surface this via a metric for ops visibility.
      await emitMetric(args.store, {
        event: 'proposal_acceptance_blocked',
        session_id: args.sessionId ?? 'session',
        proposal_id: args.proposalId,
        reason: 'plugin_json_registration_failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Transition queued → surfaced if needed, then surfaced → accepted.
  if (entry.state === 'queued') {
    await pstore.transition(args.proposalId, 'surfaced', args.sessionId ?? 'session');
  }
  await pstore.transition(args.proposalId, 'accepted', args.sessionId ?? 'session');
  await emitMetric(args.store, {
    event: 'proposal_accepted',
    session_id: args.sessionId ?? 'session',
    proposal_id: args.proposalId,
    kind,
    written_path: path.relative(args.projectRoot, writePath),
  });
  return {
    accepted: true,
    written_path: writePath,
    rendered: `[coherence] propose-accept: ${args.proposalId} → ${path.relative(
      args.projectRoot,
      writePath,
    )}`,
  };
}

