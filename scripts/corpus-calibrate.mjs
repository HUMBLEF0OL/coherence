#!/usr/bin/env node
/**
 * v0.2.1 corpus calibration (DD-116, DD-092 amendment 2026-05-10).
 *
 * Reads every JSON fixture under tests/fixtures/signal-corpora/{bash,
 * correction,file_creation}/{positive,negative,boundary,adversarial}/, runs
 * each detector against the fixtures with each threshold config in a small
 * sweep grid, computes precision + recall + Wilson 95% CI per config, and
 * picks the config that maximises Wilson lower bound while keeping recall
 * >= ACCEPTANCE_RECALL.
 *
 * Output:
 *   release-artifacts/v0.2.1-corpus-calibration-<ts>.json
 *
 * Acceptance (DD-092 amendment 2026-05-10):
 *   - per-detector precision_wilson_lower >= 0.7
 *   - per-detector recall >= 0.6
 *
 * If any detector with at least one positive AND one negative case fails
 * the gate, the script exits 1. Detectors with no fixtures are skipped
 * with a warning. Field calibration (against real metrics.jsonl) becomes
 * v0.4 work; this scaffold is corpus-only.
 *
 * Prereq: `npm run build` (the calibrator imports compiled detectors from
 * dist/). Run via `npm run calibrate`.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    detectBashRepetition,
    DEFAULT_BASH_REPETITION_COUNT,
    DEFAULT_BASH_REPETITION_WINDOW_MIN,
} from '../dist/signal/bashRepetition.js';
import { defaultSignalCache } from '../dist/signal/signalCache.js';
import {
    detectAgentCorrection,
    DEFAULT_AGENT_CORRECTION_COUNT,
    DEFAULT_AGENT_CORRECTION_LINE_RATIO,
    DEFAULT_AGENT_CORRECTION_WINDOW_MIN,
    DEFAULT_AGENT_CORRECTION_WINDOW_DAYS,
} from '../dist/signal/agentCorrection.js';
import {
    detectFileCreation,
    extractImportSet,
    extractHeadingHierarchy,
    DEFAULT_FILE_CREATION_COUNT,
    DEFAULT_FILE_CREATION_JACCARD,
} from '../dist/signal/fileCreation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const corpusRoot = path.join(projectRoot, 'tests', 'fixtures', 'signal-corpora');

const ACCEPTANCE_PRECISION_LOWER = 0.7;
const ACCEPTANCE_RECALL = 0.6;

/** Wilson 95% CI (mirrors src/util/wilson.ts). */
function wilson95(successes, trials) {
    const Z_95 = 1.959964;
    if (trials === 0) return { mean: 0, lower: 0, upper: 0 };
    const phat = successes / trials;
    const z2 = Z_95 * Z_95;
    const denom = 1 + z2 / trials;
    const center = (phat + z2 / (2 * trials)) / denom;
    const margin =
        (Z_95 * Math.sqrt((phat * (1 - phat)) / trials + z2 / (4 * trials * trials))) /
        denom;
    return {
        mean: phat,
        lower: Math.max(0, center - margin),
        upper: Math.min(1, center + margin),
    };
}

function loadCases() {
    const out = [];
    function walk(dir) {
        if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return;
        for (const name of readdirSync(dir)) {
            const full = path.join(dir, name);
            const st = statSync(full);
            if (st.isDirectory()) walk(full);
            else if (name.endsWith('.json')) {
                const data = JSON.parse(readFileSync(full, 'utf8'));
                out.push({
                    relPath: path.relative(corpusRoot, full).replace(/\\/g, '/'),
                    data,
                });
            }
        }
    }
    walk(corpusRoot);
    return out;
}

function runBash(c, cfg) {
    let cache = defaultSignalCache();
    let fired = false;
    for (const s of c.samples) {
        const r = detectBashRepetition(cache, s.command, new Date(s.at), cfg);
        cache = r.cache;
        if (r.fired) fired = true;
    }
    return fired;
}

function runCorrection(c, cfg) {
    return detectAgentCorrection(c.samples, c.agent_id, new Date(c.now), cfg).fired;
}

function runFileCreation(c, cfg) {
    let cache = defaultSignalCache();
    const recentTokens = new Map();
    const recentImports = new Map();
    const recentHeadings = new Map();
    let fired = false;
    for (const s of c.samples) {
        const r = detectFileCreation(
            cache,
            s.filePath,
            s.content,
            recentTokens,
            cfg,
            recentImports,
            recentHeadings,
        );
        if (r.fired) fired = true;
        // Replicate the cache + locality maps the host would maintain.
        recentTokens.set(s.filePath, structuralTokens(s.content));
        recentImports.set(s.filePath, extractImportSet(s.filePath, s.content));
        recentHeadings.set(s.filePath, extractHeadingHierarchy(s.filePath, s.content));
    }
    return fired;
}

/** Local mirror of structuralTokens (private in src/signal/fileCreation.ts). */
function structuralTokens(content) {
    const lines = content
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .slice(0, 5);
    const tokens = new Set();
    for (const line of lines) {
        for (const t of line.toLowerCase().split(/\s+/)) {
            if (t.length > 0) tokens.add(t);
        }
    }
    return tokens;
}

function evaluate(cases, kind, runner, cfg) {
    let tp = 0,
        fp = 0,
        tn = 0,
        fn = 0;
    for (const { data } of cases) {
        if (data.kind !== kind) continue;
        const fired = runner(data, cfg);
        if (data.expected_fired && fired) tp++;
        else if (!data.expected_fired && fired) fp++;
        else if (!data.expected_fired && !fired) tn++;
        else fn++;
    }
    const total = tp + fp + tn + fn;
    const precDenom = tp + fp;
    const recDenom = tp + fn;
    const precision = precDenom === 0 ? 0 : tp / precDenom;
    const recall = recDenom === 0 ? 0 : tp / recDenom;
    const wilson = wilson95(tp, precDenom);
    return {
        tp,
        fp,
        tn,
        fn,
        total,
        precision,
        recall,
        wilson_95: wilson,
    };
}

function sweep(cases, kind, runner, grid, defaults) {
    const kindCases = cases.filter((c) => c.data.kind === kind);
    if (kindCases.length === 0) {
        return {
            kind,
            case_count: 0,
            skipped: true,
            reason: 'no fixtures',
            default_config: defaults,
        };
    }
    const positive = kindCases.filter((c) => c.data.expected_fired === true).length;
    const negative = kindCases.filter((c) => c.data.expected_fired === false).length;
    const results = [];
    for (const cfg of grid) {
        const m = evaluate(cases, kind, runner, cfg);
        results.push({ config: cfg, ...m });
    }
    // Sort by Wilson lower bound desc, then recall desc.
    results.sort(
        (a, b) =>
            b.wilson_95.lower - a.wilson_95.lower ||
            b.recall - a.recall ||
            b.precision - a.precision,
    );
    // Pick best with recall >= ACCEPTANCE_RECALL; fall back to top of sweep.
    const eligible = results.filter((r) => r.recall >= ACCEPTANCE_RECALL);
    const recommended = eligible.length > 0 ? eligible[0] : results[0];
    const passes =
        recommended.wilson_95.lower >= ACCEPTANCE_PRECISION_LOWER &&
        recommended.recall >= ACCEPTANCE_RECALL;
    return {
        kind,
        case_count: kindCases.length,
        positive_cases: positive,
        negative_cases: negative,
        default_config: defaults,
        recommended_config: recommended.config,
        recommended_metrics: {
            precision: recommended.precision,
            precision_wilson_lower: recommended.wilson_95.lower,
            precision_wilson_upper: recommended.wilson_95.upper,
            recall: recommended.recall,
            tp: recommended.tp,
            fp: recommended.fp,
            tn: recommended.tn,
            fn: recommended.fn,
        },
        gate_passes: passes,
        sweep_top_5: results.slice(0, 5).map((r) => ({
            config: r.config,
            precision: r.precision,
            precision_wilson_lower: r.wilson_95.lower,
            recall: r.recall,
        })),
    };
}

function bashGrid() {
    const grid = [];
    for (const count of [2, 3, 4, 5]) {
        for (const windowMinutes of [15, 30, 45, 60]) {
            grid.push({ count, windowMinutes });
        }
    }
    return grid;
}

function correctionGrid() {
    const grid = [];
    for (const occurrenceCount of [2, 3, 4]) {
        for (const lineRatio of [0.15, 0.2, 0.25, 0.3]) {
            for (const windowMinutes of [3, 5, 7, 10]) {
                grid.push({ occurrenceCount, lineRatio, windowMinutes });
            }
        }
    }
    return grid;
}

function fileCreationGrid() {
    const grid = [];
    for (const count of [2, 3, 4]) {
        for (const jaccard of [0.7, 0.75, 0.8, 0.85]) {
            grid.push({ count, jaccard });
        }
    }
    return grid;
}

function fmt(n) {
    return Number.isFinite(n) ? n.toFixed(3) : 'NaN';
}

function main() {
    const argv = process.argv.slice(2);
    const enforceGates = !argv.includes('--allow-incomplete');

    const cases = loadCases();
    console.log(
        `[corpus-calibrate] loaded ${cases.length} fixture cases from ${path.relative(projectRoot, corpusRoot).replace(/\\/g, '/')}`,
    );

    const bash = sweep(
        cases,
        'bash_repetition',
        runBash,
        bashGrid(),
        {
            count: DEFAULT_BASH_REPETITION_COUNT,
            windowMinutes: DEFAULT_BASH_REPETITION_WINDOW_MIN,
        },
    );
    const correction = sweep(
        cases,
        'agent_correction',
        runCorrection,
        correctionGrid(),
        {
            occurrenceCount: DEFAULT_AGENT_CORRECTION_COUNT,
            lineRatio: DEFAULT_AGENT_CORRECTION_LINE_RATIO,
            windowMinutes: DEFAULT_AGENT_CORRECTION_WINDOW_MIN,
            windowDays: DEFAULT_AGENT_CORRECTION_WINDOW_DAYS,
        },
    );
    const fileCreation = sweep(
        cases,
        'file_creation',
        runFileCreation,
        fileCreationGrid(),
        {
            count: DEFAULT_FILE_CREATION_COUNT,
            jaccard: DEFAULT_FILE_CREATION_JACCARD,
        },
    );

    const detectors = {
        bash_repetition: bash,
        agent_correction: correction,
        file_creation: fileCreation,
    };

    // Overall pass = every non-skipped detector passes the gate.
    const evaluated = [bash, correction, fileCreation].filter((d) => !d.skipped);
    const overallPass =
        evaluated.length > 0 && evaluated.every((d) => d.gate_passes);

    const summary = {
        schema_version: 1,
        generated_at: new Date().toISOString(),
        corpus_path: path.relative(projectRoot, corpusRoot).replace(/\\/g, '/'),
        case_count: cases.length,
        acceptance_floor: {
            precision_wilson_lower: ACCEPTANCE_PRECISION_LOWER,
            recall: ACCEPTANCE_RECALL,
        },
        detectors,
        overall_pass: overallPass,
    };

    const outDir = path.join(projectRoot, 'release-artifacts');
    mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `v0.2.1-corpus-calibration-${Date.now()}.json`);
    writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    console.log(`[corpus-calibrate] wrote ${path.relative(projectRoot, outPath).replace(/\\/g, '/')}`);

    for (const [name, d] of Object.entries(detectors)) {
        if (d.skipped) {
            console.warn(
                `[corpus-calibrate] ${name.padEnd(18)}: SKIP (no fixtures)`,
            );
            continue;
        }
        const tag = d.gate_passes ? 'PASS' : 'FAIL';
        console.log(
            `[corpus-calibrate] ${name.padEnd(18)}: ${tag} (n=${d.case_count}, precision_lower=${fmt(d.recommended_metrics.precision_wilson_lower)}, recall=${fmt(d.recommended_metrics.recall)}, recommended=${JSON.stringify(d.recommended_config)})`,
        );
    }

    if (!overallPass) {
        console.error('');
        console.error(
            '[corpus-calibrate] CALIBRATION GATE FAILED — corpus is too small or thresholds need refinement.',
        );
        console.error(
            '[corpus-calibrate] Acceptance floor: precision_wilson_lower >= ' +
                ACCEPTANCE_PRECISION_LOWER +
                ', recall >= ' +
                ACCEPTANCE_RECALL,
        );
        console.error(
            '[corpus-calibrate] Path forward: expand tests/fixtures/signal-corpora/ to >= ~30 cases per detector before v0.2.1 ships.',
        );
        if (enforceGates) {
            process.exit(1);
        }
        console.error('[corpus-calibrate] (--allow-incomplete present, exiting clean)');
    }
}

main();
