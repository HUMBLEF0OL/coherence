/**
 * /coherence:doctor — host-capability probes.
 * TS-8 §8.4, FR-INSTALL-3, FR-INSTALL-6
 * Probes: subagent_attribution, frontmatter_preserves_unknown_keys,
 *         hook_event_shapes, token_count_in_posttooluse.
 * Writes host-capabilities.json atomically.
 */
import type { StateStore } from '../state/stateStore.js';
import type { HostCapabilities } from '../types/index.js';

export interface DoctorOptions {
  initialProbe?: boolean;
  hostVersion?: string;
}

export interface DoctorResult {
  capabilities: HostCapabilities;
  fromCache: boolean;
  nudgeReprobe: boolean;
  actions: string[];
}

function probeCapabilities(hostVersion?: string): HostCapabilities {
  return {
    subagent_attribution: typeof process.env['CLAUDE_SUBAGENT_ATTRIBUTION'] !== 'undefined',
    frontmatter_preserves_unknown_keys: true,
    hook_event_shapes: {
      PostToolUse: 'tool_name,tool_input,tool_response',
      SessionStart: 'session_id',
      Stop: 'session_id',
    },
    token_count_in_posttooluse:
      typeof process.env['CLAUDE_TOKEN_COUNT_IN_POSTTOOLUSE'] !== 'undefined',
    ...(hostVersion ? { host_version: hostVersion } : {}),
  };
}

export async function runDoctor(
  store: StateStore,
  opts: DoctorOptions = {},
): Promise<DoctorResult> {
  const actions: string[] = [];
  let fromCache = false;
  let nudgeReprobe = false;

  if (opts.initialProbe) {
    // Check if already probed this session
    const existing = await store.read<HostCapabilities>('host-capabilities.json');
    if (existing) {
      // Check for host version delta
      if (opts.hostVersion && existing.host_version && existing.host_version !== opts.hostVersion) {
        nudgeReprobe = true;
        actions.push(
          `Host version changed (${existing.host_version} → ${opts.hostVersion}). Run /coherence:doctor to reprobe.`,
        );
      }
      return { capabilities: existing, fromCache: true, nudgeReprobe, actions };
    }
  }

  const existing = await store.read<HostCapabilities>('host-capabilities.json');
  if (existing && !opts.initialProbe) {
    fromCache = false; // explicit invocation always reprobe
  }

  // Run probes
  const caps = probeCapabilities(opts.hostVersion);
  await store.write('host-capabilities.json', caps);
  actions.push('Probed and wrote host-capabilities.json');

  actions.push(`  subagent_attribution: ${caps.subagent_attribution}`);
  actions.push(`  frontmatter_preserves_unknown_keys: ${caps.frontmatter_preserves_unknown_keys}`);
  actions.push(`  token_count_in_posttooluse: ${caps.token_count_in_posttooluse}`);

  if (!caps.frontmatter_preserves_unknown_keys) {
    actions.push('  ⚠ Host strips unknown frontmatter keys — run /coherence:enable-sidecars');
  }

  return { capabilities: caps, fromCache, nudgeReprobe, actions };
}

export function formatDoctor(result: DoctorResult): string {
  const lines = [result.fromCache ? '[coherence] doctor (cached):' : '[coherence] doctor:'];
  for (const a of result.actions) lines.push(`  ${a}`);
  if (result.nudgeReprobe) {
    lines.push('  Run /coherence:doctor to refresh capability probe.');
  }
  return lines.join('\n');
}
