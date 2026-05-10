/**
 * /coherence:doctor — host-capability probes.
 * TS-8 §8.4, FR-INSTALL-3, FR-INSTALL-6
 * Probes: subagent_attribution, frontmatter_preserves_unknown_keys,
 *         hook_event_shapes, token_count_in_posttooluse.
 * Writes host-capabilities.json atomically.
 */
import type { StateStore } from '../state/stateStore.js';
import type { HostCapabilities } from '../types/index.js';
import type { HostCapabilitiesV02 } from '../observability/statusline.js';

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

/**
 * A7 fix: probe v0.2 host capabilities.
 *
 * Detection heuristics:
 *  - `terminal_hyperlink`: walks `TERM_PROGRAM` and `TERM` env vars. iTerm2,
 *    WezTerm, kitty, Alacritty support OSC 8. Apple_Terminal supports
 *    OSC 52 only. Default `plain`. Honours `FORCE_HYPERLINK=1` (forces osc8).
 *  - `claude_url_scheme_supported`: env `CLAUDE_URL_SCHEME=1` forces true,
 *    otherwise defaults to false. (Real detection requires host APIs that
 *    aren't exposed; this is a conservative default.)
 */
function probeTerminalHyperlink(env: NodeJS.ProcessEnv): 'osc8' | 'osc52' | 'plain' {
  if (env['FORCE_HYPERLINK'] === '1') return 'osc8';

  // Q6: env-var sentinels for terminals that don't always set TERM_PROGRAM.
  if (env['WT_SESSION']) return 'osc8'; // Windows Terminal
  if (env['KONSOLE_VERSION']) return 'osc8'; // KDE Konsole
  if (env['TILIX_ID']) return 'osc8'; // Tilix
  if (env['VTE_VERSION']) {
    // GNOME Terminal / xfce4-terminal use VTE; OSC 8 since VTE 0.50 (~2017).
    const v = parseInt(env['VTE_VERSION'] ?? '0', 10);
    if (v >= 5000) return 'osc8';
  }

  const tp = (env['TERM_PROGRAM'] ?? '').toLowerCase();
  const term = (env['TERM'] ?? '').toLowerCase();
  const osc8Hosts = [
    'iterm.app',
    'wezterm',
    'kitty',
    'alacritty',
    'vscode',
    'hyper',
    'gnome-terminal',
    'xterm-kitty',
  ];
  for (const h of osc8Hosts) {
    if (tp.includes(h) || term.includes(h)) return 'osc8';
  }
  if (tp.includes('apple_terminal')) return 'osc52';
  return 'plain';
}

function probeCapabilities(hostVersion?: string): HostCapabilities & HostCapabilitiesV02 {
  const env = process.env;
  return {
    subagent_attribution: typeof env['CLAUDE_SUBAGENT_ATTRIBUTION'] !== 'undefined',
    frontmatter_preserves_unknown_keys: true,
    hook_event_shapes: {
      PostToolUse: 'tool_name,tool_input,tool_response',
      SessionStart: 'session_id',
      Stop: 'session_id',
    },
    token_count_in_posttooluse:
      typeof env['CLAUDE_TOKEN_COUNT_IN_POSTTOOLUSE'] !== 'undefined',
    ...(hostVersion ? { host_version: hostVersion } : {}),
    // v0.2 (DD-090):
    terminal_hyperlink: probeTerminalHyperlink(env),
    claude_url_scheme_supported: env['CLAUDE_URL_SCHEME'] === '1',
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
  // A7: surface v0.2 capabilities in the doctor report.
  const v2 = caps as HostCapabilitiesV02;
  if (v2.terminal_hyperlink !== undefined) {
    actions.push(`  terminal_hyperlink: ${v2.terminal_hyperlink}`);
  }
  if (v2.claude_url_scheme_supported !== undefined) {
    actions.push(`  claude_url_scheme_supported: ${v2.claude_url_scheme_supported}`);
  }

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
