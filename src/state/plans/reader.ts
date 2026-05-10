/**
 * v0.3 M3 — cross-team plan reader.
 *
 * Lists plans from `coherence/plans/<branch-sha>/*.json`. Listing per-branch
 * is cheap; a callsite that wants "all known plans" iterates every branch
 * subdirectory.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import type { TeamPlan } from './writer.js';

export interface ListPlansResult {
  plans: TeamPlan[];
  /** Branch shas that contained at least one plan. */
  branches: string[];
}

export function listPlansForBranch(projectRoot: string, branchSha: string): TeamPlan[] {
  const dir = path.join(projectRoot, 'coherence', 'plans', branchSha);
  if (!existsSync(dir)) return [];
  const out: TeamPlan[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(dir, name);
    try {
      const raw = readFileSync(full, 'utf8');
      out.push(JSON.parse(raw) as TeamPlan);
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

export function listAllPlans(projectRoot: string): ListPlansResult {
  const root = path.join(projectRoot, 'coherence', 'plans');
  if (!existsSync(root)) return { plans: [], branches: [] };
  const plans: TeamPlan[] = [];
  const branches: string[] = [];
  for (const name of readdirSync(root)) {
    const full = path.join(root, name);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    branches.push(name);
    plans.push(...listPlansForBranch(projectRoot, name));
  }
  return { plans, branches };
}

/** Returns plans whose `created_at` is older than the supplied cutoff. */
export function findStalePlans(plans: TeamPlan[], cutoffIso: string): TeamPlan[] {
  return plans.filter((p) => p.created_at < cutoffIso);
}
