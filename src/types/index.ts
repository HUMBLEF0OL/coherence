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
  source: 'posttooluse' | 'assertion' | 'revert' | 'manual';
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
}

export type CoherenceMode = 'observe' | 'graduated';

export interface CoherenceConfig {
  mode: CoherenceMode;
  watches?: string[];
  ignore?: string[];
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
  stage: 'stage1' | 'stage2';
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  prompt_version: { stage1?: string; stage2?: string };
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
