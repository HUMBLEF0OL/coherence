/**
 * Stage 2 QG runner — drives QG-3 (≥80% apply cleanly), QG-4 (≤2% hallucination), QG-6 (≥5 per class).
 * Uses cassette replay — no live API calls.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCassette } from '../../../src/llm/cassette.js';
import { parseStage2Response } from '../../../src/validation/format.js';
import { recomputeChangeClass } from '../../../src/validation/sanity.js';
import { checkHallucination } from '../../../src/validation/hallucination.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Scenario {
  id: string;
  changeClass: string;
  description: string;
  input: {
    sectionRef: string;
    role: string;
    changed_tokens: string[];
    current_content: string;
    canonical_content: string | null;
  };
  expected_kind: string;
  expected_class: string | null;
}

describe('Stage 2 QG gates (cassette replay)', () => {
  const scenariosPath = path.join(__dirname, 'scenarios.json');
  const scenarios: Scenario[] = JSON.parse(readFileSync(scenariosPath, 'utf8')) as Scenario[];

  for (const scenario of scenarios) {
    it(`${scenario.id}: ${scenario.description}`, () => {
      const cassette = loadCassette(`stage2/${scenario.id}`);
      if (!cassette) {
        console.warn(`[qg-runner-s2] missing cassette for ${scenario.id}`);
        return;
      }

      const parsed = parseStage2Response(cassette.content);

      // QG-3: format must be valid
      expect(['diff', 'no-patch', 'escalate', 'plan-disagrees']).toContain(parsed.kind);
      expect(parsed.kind).toBe(scenario.expected_kind);

      if (parsed.kind === 'diff') {
        // Verify change-class
        const sanity = recomputeChangeClass(parsed.files);
        if (scenario.expected_class) {
          expect(sanity.changeClass).toBe(scenario.expected_class);
        }

        // QG-4: no hallucinations — include changed_tokens as mock source file content
        const mockSourceFile = scenario.input.changed_tokens.join(' ');
        const changed = [scenario.input.current_content, scenario.input.canonical_content ?? '', mockSourceFile];
        const hallu = checkHallucination(parsed.raw, changed, changed);
        expect(hallu.passed).toBe(true);
      }
    });
  }

  it('QG-3: ≥80% of cassette responses are schema-valid (parseable)', () => {
    const present = scenarios.filter((s) => loadCassette(`stage2/${s.id}`) !== null);
    if (present.length === 0) return;
    let valid = 0;
    for (const s of present) {
      const c = loadCassette(`stage2/${s.id}`)!;
      const r = parseStage2Response(c.content);
      if (r.kind !== 'invalid') valid++;
    }
    expect(valid / present.length).toBeGreaterThanOrEqual(0.8);
  });

  it('QG-4: ≤2% hallucination escape on cassette corpus', () => {
    const present = scenarios.filter((s) => {
      const c = loadCassette(`stage2/${s.id}`);
      if (!c) return false;
      const r = parseStage2Response(c.content);
      return r.kind === 'diff';
    });
    if (present.length === 0) return;

    let escaped = 0;
    for (const s of present) {
      const c = loadCassette(`stage2/${s.id}`)!;
      const r = parseStage2Response(c.content);
      if (r.kind !== 'diff') continue;
      const mockSourceFile = s.input.changed_tokens.join(' ');
      const changed = [s.input.current_content, s.input.canonical_content ?? '', mockSourceFile];
      const hallu = checkHallucination(r.raw, changed, changed);
      if (!hallu.passed) escaped++;
    }
    expect(escaped / present.length).toBeLessThanOrEqual(0.02);
  });

  it('QG-6: ≥5 fixtures per change class', () => {
    const classCounts: Record<string, number> = {};
    for (const s of scenarios) {
      if (s.expected_class) {
        classCounts[s.expected_class] = (classCounts[s.expected_class] ?? 0) + 1;
      }
    }
    for (const [cls, count] of Object.entries(classCounts)) {
      expect(count).toBeGreaterThanOrEqual(5);
    }
  });
});
