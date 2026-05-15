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
  target?: string;
  helpText?: string;
}

export async function routePlan(
  args: string[],
  _opts: RouteOpts = {},
): Promise<RouteResult> {
  if (args.length === 0) return { subcommand: 'help', helpText: HELP };
  const sub = args[0];
  if (!(PLAN_SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
  }
  const result: RouteResult = { subcommand: sub as PlanSubcommand };
  if (args[1] !== undefined) result.target = args[1];
  return result;
}
