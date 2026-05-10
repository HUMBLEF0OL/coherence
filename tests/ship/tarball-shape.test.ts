/**
 * Stub for M-LEGACY-1 (NFR-ARCH-2, DD-118) — slim-tarball ship gate.
 *
 * Filled in M6: runs `npm pack --dry-run`, parses the file list, and asserts:
 *   - no path under `prompts/v1/` (DD-118: legacy artifacts excluded)
 *   - no `src/state/migrate/v1_to_v2.ts` (DD-080 retired)
 *   - tarball ≤ 10 MB (M-INSTALL-1)
 *   - no test fixtures or development-only files
 */
import { describe, it } from 'vitest';

describe('M-LEGACY-1: slim tarball (NFR-ARCH-2, DD-118)', () => {
  it.skip('TODO: filled in M6 (M-LEGACY-1 NFR-ARCH-2 DD-118)', () => {
    // Implemented in M6.
  });
});
