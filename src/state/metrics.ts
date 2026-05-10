/**
 * Metrics event emitter — metrics.jsonl append log.
 * TS-7 §7.5, NFR-OBS-2, DD-057
 */
import type { StateStore } from './stateStore.js';
import type { ChangeClass, SectionRef } from '../types/index.js';

export type MetricEventType =
  | 'patch_proposed'
  | 'patch_applied'
  | 'patch_reverted'
  | 'patch_deferred'
  | 'hallucination_grep_result'
  | 'cost_per_stop'
  | 'compaction_detected'
  | 'degraded_mode_entered'
  | 'kill_switch_seen'
  | 'subagent_classification'
  // DD-068 v0.1.1 privacy-safe Author-signal events (substrate for v0.2 detectors).
  | 'tool_invocation_signature'
  | 'user_prompt_signature'
  | 'agent_response_id'
  // v0.2 telemetry catalogue (FR-OBS-N4) — emitted by M5/M6/M7 entry points.
  | 'proposal_proposed'
  | 'proposal_surfaced'
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'proposal_expired'
  | 'proposal_state_transition'
  | 'proposal_validation_failed'
  | 'proposal_acceptance_blocked'
  | 'proposal_signal_observed'
  | 'proposal_listed'
  | 'proposal_shown'
  | 'proposal_reverted'
  | 'proposal_skipped_budget'
  | 'annotation_proposed'
  | 'annotate_invocation'
  | 'annotate_blocked'
  | 'statusline_install'
  | 'statusline_uninstall'
  | 'trickle_scan_pass'
  | 'signal_cache_pruned'
  | 'migration_completed'
  | 'cost_ceiling_hit'
  | 'state_history_truncated'
  // v0.3 telemetry catalogue (round-1 G5 + round-2 C3 finalised roster).
  | 'scope_cache_miss'
  | 'proposal_ignored_by_team'
  | 'plan_created'
  | 'plan_accepted'
  | 'plan_rejected'
  | 'metrics_export_started';

export interface PromptVersion {
  stage1?: string;
  stage2?: string;
}

interface BaseMetricEvent {
  event: MetricEventType;
  session_id: string;
}

export interface PatchProposedEvent extends BaseMetricEvent {
  event: 'patch_proposed';
  sectionRef: SectionRef;
  changeClass: ChangeClass;
  prompt_version: PromptVersion;
}

export interface PatchAppliedEvent extends BaseMetricEvent {
  event: 'patch_applied';
  sectionRef: SectionRef;
  changeClass: ChangeClass;
  prompt_version: PromptVersion;
}

export interface PatchRevertedEvent extends BaseMetricEvent {
  event: 'patch_reverted';
  sectionRef: SectionRef;
}

export interface PatchDeferredEvent extends BaseMetricEvent {
  event: 'patch_deferred';
  sectionRef: SectionRef;
  reason: string;
}

export interface HallucinationGrepResultEvent extends BaseMetricEvent {
  event: 'hallucination_grep_result';
  sectionRef: SectionRef;
  passed: boolean;
  demoteClass: boolean;
  unknownStrictCount: number;
  unknownLooseOnlyCount: number;
  prompt_version: PromptVersion;
}

export interface CostPerStopEvent extends BaseMetricEvent {
  event: 'cost_per_stop';
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  prompt_version: PromptVersion;
}

export interface CompactionDetectedEvent extends BaseMetricEvent {
  event: 'compaction_detected';
}

export interface DegradedModeEnteredEvent extends BaseMetricEvent {
  event: 'degraded_mode_entered';
  reason: string;
}

export interface KillSwitchSeenEvent extends BaseMetricEvent {
  event: 'kill_switch_seen';
  sentinel: 'disabled' | 'DISABLED';
}

export interface SubagentClassificationEvent extends BaseMetricEvent {
  event: 'subagent_classification';
  classification: 'accepted' | 'edited' | 'discarded' | 'rejected';
  prompt_version: PromptVersion;
}

/**
 * Generic v0.2 telemetry event. Used for DD-068 signature events and the
 * full v0.2 metrics catalogue. Payload shapes are documented per event in
 * `docs/v0.2/CHANGELOG.md`; we keep the type permissive at the writer so
 * the schema is enforced where the event is constructed.
 */
export interface GenericV02Event extends BaseMetricEvent {
  event: MetricEventType;
  [key: string]: unknown;
}

export type MetricEvent =
  | PatchProposedEvent
  | PatchAppliedEvent
  | PatchRevertedEvent
  | PatchDeferredEvent
  | HallucinationGrepResultEvent
  | CostPerStopEvent
  | CompactionDetectedEvent
  | DegradedModeEnteredEvent
  | KillSwitchSeenEvent
  | SubagentClassificationEvent
  | GenericV02Event;

export async function emitMetric(store: StateStore, event: MetricEvent): Promise<void> {
  await store.appendJsonl('metrics.jsonl', event);
}
