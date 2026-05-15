/**
 * /coherence:plan <subcommand> router (C3).
 *
 * Parse-only — see `proposeRouter` docstring for design rationale.
 */
export const PLAN_SUBCOMMANDS = ['accept', 'create', 'reject'] as const;

export type PlanSubcommand = (typeof PLAN_SUBCOMMANDS)[number];

const HELP = [
  '/coherence:plan <subcommand>',
  'Subcommands:',
  '  accept <branch-sha> <plan-id>          accept a cross-team plan (DD-099)',
  '  create <kind> <title> [--body <text>]  author a cross-team plan',
  '  reject <branch-sha> <plan-id> <reason> reject a plan (stale | superseded | rejected_explicit)',
].join('\n');

export interface RouteOpts {
  dry?: boolean;
}

export interface RouteResult {
  subcommand: PlanSubcommand | 'help';
  /** First positional after the subcommand (convenience). */
  target?: string;
  /** All trailing args, verbatim — handlers like `plan create` consume
   *  multiple positionals (`<kind> <title>`) and `--body <text>` flags. */
  args: string[];
  helpText?: string;
}

// eslint-disable-next-line @typescript-eslint/require-await -- async signature reserved for future execute mode (RouteOpts.dry); parse-only today
export async function routePlan(
  args: string[],
  _opts: RouteOpts = {},
): Promise<RouteResult> {
  if (args.length === 0) return { subcommand: 'help', args: [], helpText: HELP };
  const sub = args[0];
  if (!(PLAN_SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
  }
  const rest = args.slice(1);
  const result: RouteResult = { subcommand: sub as PlanSubcommand, args: rest };
  if (rest[0] !== undefined) result.target = rest[0];
  return result;
}
