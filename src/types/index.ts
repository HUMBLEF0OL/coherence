/**
 * Public-type barrel for coherence plugin.
 * TS-3 §3.14, NFR-MAINT-3
 */

/** Nominal brand helper — never instantiated at runtime */
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

/** Workspace-relative path, forward-slash, lowercase-normalised */
export type NormalizedPath = Brand<string, 'NormalizedPath'>;

/** Section reference: `<normalized-path>#<id>` with id matching [a-z0-9_-]+ */
export type SectionRef = Brand<string, 'SectionRef'>;

/** SHA-256 hex digest of a section's raw content bytes */
export type ContentHash = Brand<string, 'ContentHash'>;

export type ChangeClass = 'additive' | 'modifying' | 'destructive' | 'frontmatter';

export interface BufferEntry {
  path: NormalizedPath;
  sectionRef: SectionRef;
  contentHash: ContentHash;
  triggeredAt: string; // ISO-8601 UTC
  // v0.2 (DD-066) widens the source enum to cover the trickle deep-scan and
  // the three signal detectors. The drift-buffer schema already permits
  // these values; the TS type was the lone holdout.
  source:
  | 'posttooluse'
  | 'assertion'
  | 'revert'
  | 'manual'
  | 'proposer'
  | 'annotate'
  | 'trickle_deep_scan'
  | 'signal_bash'
  | 'signal_file'
  | 'signal_correction';
}

export interface CoherencePlan {
  canonical: SectionRef;
  sections: PlanSection[];
  demoted_canonicals?: SectionRef[];
}

export interface PlanSection {
  sectionRef: SectionRef;
  role: 'canonical' | 'reference' | 'no-change';
  relation?: 'owns' | 'mirrors' | 'omits';
}

export interface Patch {
  sectionRef: SectionRef;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- explicit literal sentinels for documentation
  diff: string | 'NO_PATCH_NEEDED' | 'ESCALATE';
  changeClass: ChangeClass;
  validationPassed: boolean;
}

export interface HostCapabilities {
  subagent_attribution: boolean;
  frontmatter_preserves_unknown_keys: boolean;
  hook_event_shapes: Record<string, string>;
  token_count_in_posttooluse: boolean;
  host_version?: string;
  /** v0.2 (DD-090) — three-tier hyperlink degradation. */
  terminal_hyperlink?: 'osc8' | 'osc52' | 'plain';
  /** v0.2 (DD-090) — claude:// URL scheme support probe. */
  claude_url_scheme_supported?: boolean;
}

export type CoherenceMode = 'observe' | 'graduated';

export interface CoherenceConfig {
  mode: CoherenceMode;
  watches?: string[];
  ignore?: string[];
  // v0.2 calibration knobs (config.schema.json). Declared on the type so
  // user `config.json` overrides survive read+rewrite round-trips. Not all
  // knobs are wired through to detectors yet — DD-092 calibration patch
  // (v0.2.1) finishes the plumbing. Detectors fall back to their
  // `DEFAULT_*` constants when the field is absent.
  proposal_expiry_days?: number;
  proposal_signal_recurrence_days?: number;
  proposal_consecutive_ignore_threshold?: number;
  bash_repetition_count?: number;
  bash_repetition_window_min?: number;
  file_creation_count?: number;
  file_creation_jaccard?: number;
  file_creation_locality_window?: number;
  agent_correction_window_min?: number;
  agent_correction_line_ratio?: number;
  agent_correction_count?: number;
  agent_correction_window_days?: number;
  agent_correction_require_burst?: boolean;
}

export interface VersionInfo {
  schema_version: number;
  plugin_version: string;
  installed_at: string;
  upgraded_at?: string;
  prior_versions: Array<{ version: string; schema_version: number; at: string }>;
}

export interface VelocityState {
  revert_window_start: string;
  revert_count: number;
  revert_timestamps: string[];
  consecutive_defer_sessions: number;
  last_defer_session_id: string | undefined;
  auto_ignored: string[];
}

export interface StopProgress {
  session_id: string;
  started_at: string;
  groups: StopProgressGroup[];
}

export interface StopProgressGroup {
  group_id: string;
  canonical: SectionRef;
  sections: Array<{
    sectionRef: SectionRef;
    status: 'pending' | 'done' | 'skipped';
    patch?: Patch;
  }>;
}

export interface CostEntry {
  session_id: string;
  timestamp: string;
  // v0.2 (DD-085): widened to accept the new Author / Annotate / Trickle
  // partitions that share the v0.1 cost-ledger file. The cost-ledger schema
  // already permits these enum values; the TS type was the lone holdout.
  stage: 'stage1' | 'stage2' | 'author' | 'annotate' | 'author_planner';
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  prompt_version: { stage1?: string; stage2?: string; author?: string; annotate?: string };
}

export interface SubagentStats {
  window_size: number;
  accepted: number;
  edited: number;
  discarded: number;
  rejected: number;
  trend_last5_vs_prior10?: number;
}

export interface SectionIndexEntry {
  path: NormalizedPath;
  sectionRef: SectionRef;
  heading: string | undefined;
  line_start: number;
  line_end: number;
  contentHash: ContentHash;
}
