/**
 * DD-068 signature hash — single source of truth across signal detectors,
 * telemetry, and proposal collision pre-checks (TS-2 §4).
 *
 * Format: sha256 of `<kind>::<canonical-payload>` truncated to 12 hex chars
 * (≈ 48 bits of entropy, < 1.8 × 10⁻⁷ collision rate over 10 000 entries
 * per SG-1).
 */
import { createHash } from 'crypto';

export type SignatureKind =
  | 'tool_invocation'
  | 'user_prompt'
  | 'agent_response'
  | 'file_write_path'
  | 'agent_correction';

export const SIGNATURE_HEX_LENGTH = 12;

export function signatureHash(kind: SignatureKind, payload: string): string {
  return createHash('sha256')
    .update(`${kind}::${payload}`)
    .digest('hex')
    .slice(0, SIGNATURE_HEX_LENGTH);
}
