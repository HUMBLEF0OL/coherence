/**
 * SHA-256 content hash for buffer entries.
 * DD-051: buffer entries use hash-only (no raw content). NFR-PRIVACY-4.
 */
import { createHash } from 'crypto';
import type { ContentHash } from '../types/index.js';

export function hashContent(content: string): ContentHash {
  return createHash('sha256').update(content, 'utf8').digest('hex') as ContentHash;
}

export function hashBuffer(buf: Buffer): ContentHash {
  return createHash('sha256').update(buf).digest('hex') as ContentHash;
}
