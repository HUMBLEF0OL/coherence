/**
 * Signal-corpora corpus-driven test (M9 deliverable).
 *
 * Walks `tests/fixtures/signal-corpora/{bash,correction}/{positive,negative,boundary,adversarial}/*.json`
 * and runs each detector against the supplied samples. Asserts the detector
 * outcome matches the fixture's `expected_fired`.
 *
 * Adding a new corpus case is intended to be a one-file change. Edit cases
 * should land in the same PR as the detector change that motivates them.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    detectBashRepetition,
} from '../../../src/signal/bashRepetition.js';
import { defaultSignalCache } from '../../../src/signal/signalCache.js';
import {
    detectAgentCorrection,
    type CorrectionSample,
} from '../../../src/signal/agentCorrection.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../fixtures/signal-corpora');

interface BashCase {
    kind: 'bash_repetition';
    description: string;
    expected_fired: boolean;
    samples: Array<{ command: string; at: string }>;
}

interface CorrectionCase {
    kind: 'agent_correction';
    description: string;
    expected_fired: boolean;
    agent_id: string;
    now: string;
    samples: CorrectionSample[];
}

type Case = BashCase | CorrectionCase;

function loadCases(): Array<{ relPath: string; data: Case }> {
    const out: Array<{ relPath: string; data: Case }> = [];
    function walk(dir: string) {
        if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return;
        for (const name of readdirSync(dir)) {
            const full = path.join(dir, name);
            const st = statSync(full);
            if (st.isDirectory()) walk(full);
            else if (name.endsWith('.json')) {
                const data = JSON.parse(readFileSync(full, 'utf8')) as Case;
                out.push({ relPath: path.relative(root, full).replace(/\\/g, '/'), data });
            }
        }
    }
    walk(root);
    return out;
}

function runBash(c: BashCase): boolean {
    let cache = defaultSignalCache();
    let fired = false;
    for (const s of c.samples) {
        const r = detectBashRepetition(cache, s.command, new Date(s.at));
        cache = r.cache;
        if (r.fired) fired = true;
    }
    return fired;
}

function runCorrection(c: CorrectionCase): boolean {
    return detectAgentCorrection(c.samples, c.agent_id, new Date(c.now)).fired;
}

describe('signal corpora (M9)', () => {
    const cases = loadCases();
    // Sanity: at least one case per kind, otherwise the suite has rotted.
    it('finds at least one bash and one correction fixture', () => {
        expect(cases.some((c) => c.data.kind === 'bash_repetition')).toBe(true);
        expect(cases.some((c) => c.data.kind === 'agent_correction')).toBe(true);
    });

    for (const { relPath, data } of cases) {
        it(`[${data.kind}] ${relPath} → fired=${data.expected_fired}`, () => {
            const fired = data.kind === 'bash_repetition' ? runBash(data) : runCorrection(data);
            expect(fired).toBe(data.expected_fired);
        });
    }
});
