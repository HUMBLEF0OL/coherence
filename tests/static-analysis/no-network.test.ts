/**
 * Stub for M-ARCH-1 (NFR-ARCH-1, DD-117) — no-backend invariant.
 *
 * Filled in M6: walks `src/` and asserts that no production module imports a
 * networking surface (`http`, `https`, `net`, `tls`, `dgram`, `node:fetch`, or
 * any TLS/socket library) outside an allow-list. The Anthropic SDK is the only
 * network sink; everything else must be file-only per DD-117 (no backend, ever).
 */
import { describe, it } from 'vitest';

describe('M-ARCH-1: no-backend invariant (NFR-ARCH-1, DD-117)', () => {
  it.skip('TODO: filled in M6 (M-ARCH-1 NFR-ARCH-1 DD-117)', () => {
    // Implemented in M6.
  });
});
