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
  | 'subagent_classification';

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
  | SubagentClassificationEvent;

export async function emitMetric(store: StateStore, event: MetricEvent): Promise<void> {
  await store.appendJsonl('metrics.jsonl', event);
}
