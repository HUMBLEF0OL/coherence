/**
 * Line-count ratio check — auto-ESCALATE if patch rewrites >40% of section.
 * TS-5 §5.5
 */

export interface LineRatioResult {
  ratio: number;
  shouldEscalate: boolean;
}

const RATIO_THRESHOLD = 0.40;

export function checkLineRatio(
  addedLines: number,
  removedLines: number,
  originalSectionLines: number,
): LineRatioResult {
  if (originalSectionLines <= 0) {
    return { ratio: 0, shouldEscalate: false };
  }
  const ratio = (addedLines + removedLines) / originalSectionLines;
  return { ratio, shouldEscalate: ratio > RATIO_THRESHOLD };
}
