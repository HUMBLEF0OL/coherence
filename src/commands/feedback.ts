/**
 * /coherence:feedback (S6) — capture session state into a JSON bundle that
 * pre-fills the GitHub tester-feedback issue template.
 *
 * Reads version + global mode + last 10 metrics entries from the local
 * coherence dir, redacts any non-project paths from the user-supplied note,
 * and returns a serialisable bundle. No network — the user pastes the bundle
 * into the issue form themselves.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  PLUGIN_VERSION,
  getCoherenceDir,
  makeStateStore,
} from '../state/init.js';
import { readGraduation } from '../state/graduation.js';
import { nowIsoUtc } from '../util/time.js';

export interface FeedbackActivity {
  ts: string;
  kind: string;
}

export interface FeedbackBundle {
  pluginVersion: string;
  mode: string;
  capturedAt: string;
  userMessage: string;
  recentActivity: FeedbackActivity[];
}

export interface CaptureOpts {
  projectRoot: string;
  userMessage: string;
}

// Matches POSIX absolute paths and Windows drive paths, e.g. `/Users/...`
// or `C:\Users\...`. Case-insensitive drive letter to cover lowercase tmp
// dirs on Windows.
const PATH_RE = /(?:\/|[A-Za-z]:[\\/])[^\s'"]+/g;

// Slashes are normalised on both platforms (forward slashes are valid path
// separators on Windows). Case-folding is win32-only: on POSIX `/USERS/foo`
// and `/users/foo` are distinct paths, so over-eager lowering would treat
// out-of-project paths as in-project and skip redaction.
function normalisePath(p: string): string {
  const slashed = p.replace(/\\/g, '/');
  return process.platform === 'win32' ? slashed.toLowerCase() : slashed;
}

function redact(userMessage: string, projectRoot: string): string {
  const normalisedRoot = normalisePath(projectRoot);
  return userMessage.replace(PATH_RE, (match) => {
    const normalised = normalisePath(match);
    return normalised.startsWith(normalisedRoot) ? match : '[redacted-path]';
  });
}

function readRecentMetrics(projectRoot: string, limit: number): FeedbackActivity[] {
  const file = path.join(getCoherenceDir(projectRoot), 'metrics.jsonl');
  if (!existsSync(file)) return [];
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const tail = lines.slice(-limit);
  const out: FeedbackActivity[] = [];
  for (const line of tail) {
    try {
      // StateStore.appendJsonl stamps every record with `_ts` (DD-068); fall
      // back to a literal `ts` field for test fixtures that bypass the writer.
      const obj = JSON.parse(line) as { event?: unknown; _ts?: unknown; ts?: unknown };
      const kind = typeof obj.event === 'string' ? obj.event : 'unknown';
      const ts =
        typeof obj._ts === 'string'
          ? obj._ts
          : typeof obj.ts === 'string'
          ? obj.ts
          : '';
      out.push({ ts, kind });
    } catch {
      /* skip malformed lines */
    }
  }
  return out;
}

async function resolveGlobalMode(projectRoot: string): Promise<string> {
  try {
    const store = makeStateStore(projectRoot);
    const graduation = await readGraduation(store);
    return graduation.global_mode;
  } catch {
    return 'observe';
  }
}

export async function captureFeedbackBundle(opts: CaptureOpts): Promise<FeedbackBundle> {
  const redacted = redact(opts.userMessage, opts.projectRoot);
  const mode = await resolveGlobalMode(opts.projectRoot);
  const recentActivity = readRecentMetrics(opts.projectRoot, 10);
  return {
    pluginVersion: PLUGIN_VERSION,
    mode,
    capturedAt: nowIsoUtc(),
    userMessage: redacted,
    recentActivity,
  };
}
