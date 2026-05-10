/**
 * Wilson 95% confidence interval (DD-092 calibration commitment).
 *
 * Per the v0.2 Open Question §7 default, we use Wilson over Clopper-Pearson
 * or bootstrap because:
 *   - Well-suited to small sample sizes typical of telemetry windows.
 *   - Closed-form (no iterative root-finding).
 *   - Accepted by FR-PRIVACY/NFR-OBS-2 reviewers as the canonical method.
 *
 * Use: `wilson95(successes, trials)` returns `{ lower, upper, mean }`.
 *
 * Example: 7 fired-and-accepted out of 12 fired → wilson95(7, 12) →
 *   { mean: 0.583, lower: 0.319, upper: 0.812 }
 *
 * If the lower bound ≥ 0.7 the calibrated threshold is "tight enough"
 * per DD-092 acceptance criteria.
 */

const Z_95 = 1.959964; // Two-tailed 95% z-score.

export interface WilsonInterval {
  /** Mean estimate (successes / trials), or 0 if trials = 0. */
  mean: number;
  /** Lower bound of the 95% Wilson interval. */
  lower: number;
  /** Upper bound of the 95% Wilson interval. */
  upper: number;
  /** Sample size. */
  trials: number;
  /** Successes. */
  successes: number;
}

export function wilson95(successes: number, trials: number): WilsonInterval {
  if (trials < 0 || successes < 0 || successes > trials) {
    throw new Error(
      `wilson95: invalid inputs (successes=${successes}, trials=${trials})`,
    );
  }
  if (trials === 0) {
    return { mean: 0, lower: 0, upper: 0, trials: 0, successes: 0 };
  }
  const phat = successes / trials;
  const z = Z_95;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (phat + z2 / (2 * trials)) / denom;
  const margin =
    (z * Math.sqrt((phat * (1 - phat)) / trials + z2 / (4 * trials * trials))) /
    denom;
  return {
    mean: phat,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    trials,
    successes,
  };
}

/**
 * Helper for DD-092 calibration: returns `true` if the Wilson lower bound
 * satisfies the projected-precision floor (default 0.7).
 */
export function meetsCalibrationFloor(
  successes: number,
  trials: number,
  floor = 0.7,
): boolean {
  return wilson95(successes, trials).lower >= floor;
}
