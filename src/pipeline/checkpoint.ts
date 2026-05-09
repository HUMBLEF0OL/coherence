/**
 * Stop progress checkpoint — atomic rewrite between every Stage 2 call.
 * FR-STOP-12, TS-3 §3.8 (stop-progress.json)
 */
import type { StateStore } from '../state/stateStore.js';
import type { StopProgress, StopProgressGroup, SectionRef, Patch } from '../types/index.js';
import { nowIsoUtc } from '../util/time.js';

export class Checkpoint {
  constructor(
    private readonly store: StateStore,
    private readonly sessionId: string,
  ) {}

  async load(): Promise<StopProgress | null> {
    return this.store.read<StopProgress>('stop-progress.json');
  }

  async init(groups: StopProgressGroup[]): Promise<void> {
    const progress: StopProgress = {
      session_id: this.sessionId,
      started_at: nowIsoUtc(),
      groups,
    };
    await this.store.write('stop-progress.json', progress);
  }

  async markDone(
    groupId: string,
    sectionRef: SectionRef,
    patch: Patch,
  ): Promise<void> {
    const progress = await this.load();
    if (!progress) return;

    for (const group of progress.groups) {
      if (group.group_id !== groupId) continue;
      for (const s of group.sections) {
        if (s.sectionRef === sectionRef) {
          s.status = 'done';
          s.patch = patch;
          break;
        }
      }
    }
    await this.store.write('stop-progress.json', progress);
  }

  async clear(): Promise<void> {
    // Remove stop-progress.json after successful completion
    const progress = await this.load();
    if (!progress) return;
    // Overwrite with a cleared marker (no pending sections)
    const cleared: StopProgress = {
      session_id: this.sessionId,
      started_at: progress.started_at,
      groups: progress.groups.map((g) => ({
        ...g,
        sections: g.sections.map((s) => ({ ...s, status: 'done' as const })),
      })),
    };
    await this.store.write('stop-progress.json', cleared);
  }

  /** Return sections still pending (skip already-done ones for crash resume). */
  pendingSections(progress: StopProgress, groupId: string): SectionRef[] {
    const group = progress.groups.find((g) => g.group_id === groupId);
    if (!group) return [];
    return group.sections
      .filter((s) => s.status === 'pending')
      .map((s) => s.sectionRef);
  }
}
