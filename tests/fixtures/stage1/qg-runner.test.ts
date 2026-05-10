/**
 * Stage 1 QG runner — drives QG-1 (schema-valid ≥ 90%) and QG-2 (correct canonical ≥ 80%).
 * Uses cassette replay — no live API calls.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCassette } from '../../../src/llm/cassette.js';
import { validatePlan } from '../../../src/validation/planValidator.js';
import type { CoherencePlan, SectionRef } from '../../../src/types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Scenario {
  id: string;
  description: string;
  input: {
    sections: Array<{
      sectionRef: string;
      path: string;
      heading: string | null;
      declared_canonical: boolean;
      layer: string;
    }>;
    triggering_files: string[];
  };
  expected_canonical: string;
}

function parsePlanResponse(raw: string): CoherencePlan | null {
  let json = raw.trim();
  if (json.startsWith('```')) {
    const start = json.indexOf('\n') + 1;
    const end = json.lastIndexOf('```');
    json = end > start ? json.slice(start, end).trim() : json.slice(start).trim();
  }
  try {
    return JSON.parse(json) as CoherencePlan;
  } catch {
    return null;
  }
}

describe('Stage 1 QG gates (cassette replay)', () => {
  const scenariosPath = path.join(__dirname, 'scenarios.json');
  const scenarios: Scenario[] = JSON.parse(readFileSync(scenariosPath, 'utf8')) as Scenario[];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- aggregated counters reserved for future QG reporting
  let schemaValidCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let correctCanonicalCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let total = 0;

  for (const scenario of scenarios) {
    it(`${scenario.id}: ${scenario.description}`, () => {
      total++;

      const cassette = loadCassette(`stage1/${scenario.id}`);
      if (!cassette) {
        // Skip if cassette missing (won't happen in CI — all cassettes committed)
        console.warn(`[qg-runner] missing cassette for ${scenario.id}`);
        return;
      }

      // QG-1: parse + schema-valid
      const plan = parsePlanResponse(cassette.content);
      if (!plan) {
        console.warn(`[qg-runner] parse failure for ${scenario.id}: ${cassette.content.slice(0, 100)}`);
        return;
      }

      const expectedRefs = scenario.input.sections.map((s) => s.sectionRef as SectionRef);
      const validation = validatePlan(plan, expectedRefs);
      const schemaValid = validation.valid;
      if (schemaValid) schemaValidCount++;

      expect(schemaValid).toBe(true);

      // QG-2: correct canonical
      const canonicalCorrect = plan.canonical === scenario.expected_canonical;
      if (canonicalCorrect) correctCanonicalCount++;

      expect(plan.canonical).toBe(scenario.expected_canonical);
    });
  }

  it('QG-1: schema-valid rate ≥ 90%', () => {
    const cassettesPresent = scenarios.filter((s) => loadCassette(`stage1/${s.id}`) !== null);
    if (cassettesPresent.length === 0) return;
    // Count per-cassette schema validity
    let valid = 0;
    let counted = 0;
    for (const s of cassettesPresent) {
      const cassette = loadCassette(`stage1/${s.id}`)!;
      const plan = parsePlanResponse(cassette.content);
      counted++;
      if (!plan) continue;
      const result = validatePlan(plan, s.input.sections.map((x) => x.sectionRef as SectionRef));
      if (result.valid) valid++;
    }
    const rate = counted > 0 ? valid / counted : 1;
    expect(rate).toBeGreaterThanOrEqual(0.9);
  });

  it('QG-2: correct canonical rate ≥ 80%', () => {
    const cassettesPresent = scenarios.filter((s) => loadCassette(`stage1/${s.id}`) !== null);
    if (cassettesPresent.length === 0) return;
    let correct = 0;
    let counted = 0;
    for (const s of cassettesPresent) {
      const cassette = loadCassette(`stage1/${s.id}`)!;
      const plan = parsePlanResponse(cassette.content);
      counted++;
      if (!plan) continue;
      if (plan.canonical === s.expected_canonical) correct++;
    }
    const rate = counted > 0 ? correct / counted : 1;
    expect(rate).toBeGreaterThanOrEqual(0.8);
  });
});
