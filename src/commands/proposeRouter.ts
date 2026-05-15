/**
 * /coherence:propose <subcommand> router (C3).
 *
 * Parse-only: identifies the subcommand and the first positional target.
 * Returns a `help` shape with `helpText` when called bare; throws on
 * unknown subcommands. Actual handler functions (`runProposeAccept` etc.)
 * are unchanged — callers thread their own `StateStore` + `projectRoot`
 * context after consulting the router.
 */
export const PROPOSE_SUBCOMMANDS = [
  'accept',
  'list',
  'reject',
  'revert-acceptance',
  'show',
] as const;

export type ProposeSubcommand = (typeof PROPOSE_SUBCOMMANDS)[number];

const HELP = [
  '/coherence:propose <subcommand>',
  'Subcommands:',
  '  accept <section-id>             accept a quarantined proposal',
  '  list                            list pending proposals',
  '  reject <section-id>             reject a proposal',
  '  revert-acceptance <section-id>  reverse a previous accept',
  '  show <section-id>               show full proposal details',
].join('\n');

export interface RouteOpts {
  /**
   * Reserved for symmetry with future execute mode. The router is parse-only
   * today, so this flag is accepted but unused.
   */
  dry?: boolean;
}

export interface RouteResult {
  subcommand: ProposeSubcommand | 'help';
  target?: string;
  helpText?: string;
}

export async function routePropose(
  args: string[],
  _opts: RouteOpts = {},
): Promise<RouteResult> {
  if (args.length === 0) return { subcommand: 'help', helpText: HELP };
  const sub = args[0];
  if (!(PROPOSE_SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
  }
  const result: RouteResult = { subcommand: sub as ProposeSubcommand };
  if (args[1] !== undefined) result.target = args[1];
  return result;
}
