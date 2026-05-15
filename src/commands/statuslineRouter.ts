/**
 * /coherence:statusline <subcommand> router (C3).
 *
 * Parse-only — see `proposeRouter` docstring for design rationale.
 */
export const STATUSLINE_SUBCOMMANDS = ['install', 'uninstall'] as const;

export type StatuslineSubcommand = (typeof STATUSLINE_SUBCOMMANDS)[number];

const HELP = [
  '/coherence:statusline <subcommand>',
  'Subcommands:',
  '  install     install the coherence statusline into ~/.claude/settings.json (FR-STATUSLINE-2)',
  '  uninstall   restore the statusline backup created by install (FR-STATUSLINE-3)',
].join('\n');

export interface RouteOpts {
  dry?: boolean;
}

export interface RouteResult {
  subcommand: StatuslineSubcommand | 'help';
  target?: string;
  args: string[];
  helpText?: string;
}

// eslint-disable-next-line @typescript-eslint/require-await -- async signature reserved for future execute mode (RouteOpts.dry); parse-only today
export async function routeStatusline(
  args: string[],
  _opts: RouteOpts = {},
): Promise<RouteResult> {
  if (args.length === 0) return { subcommand: 'help', args: [], helpText: HELP };
  const sub = args[0];
  if (!(STATUSLINE_SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
  }
  const rest = args.slice(1);
  const result: RouteResult = { subcommand: sub as StatuslineSubcommand, args: rest };
  if (rest[0] !== undefined) result.target = rest[0];
  return result;
}
