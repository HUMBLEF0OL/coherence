/**
 * NFR-I18N-2: Non-ASCII content (CJK + emoji + RTL Arabic + combining diacritics)
 * round-trips bytes-identically through detection path.
 */
import { describe, it, expect } from 'vitest';
import { hashContent } from '../../src/buffer/contentHash.js';
import { scanAnchors } from '../../src/detection/anchorScanner.js';

const COMPLEX_CONTENT = [
  '中文内容 — CJK characters',
  '🎉🔧✅ — emoji',
  'مرحبا بالعالم — Arabic RTL',
  'café café — combining diacritics',
].join('\n');

describe('UTF-8 round-trip (NFR-I18N-2)', () => {
  it('CJK + emoji + RTL + combining diacritics hashes consistently', () => {
    const hash1 = hashContent(COMPLEX_CONTENT);
    const hash2 = hashContent(COMPLEX_CONTENT);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('anchor scanner preserves multi-byte content exactly', () => {
    const source = `<!-- coherence:section id="intl" -->\n${COMPLEX_CONTENT}\n<!-- /coherence:section -->`;
    const { sections } = scanAnchors(source, 'intl.md');
    expect(sections).toHaveLength(1);
    expect(sections[0].content).toBe(COMPLEX_CONTENT);
  });

  it('different Unicode normalization forms produce different hashes (byte-identical check)', () => {
    const nfc = 'é'; // é precomposed
    const nfd = 'é'; // é decomposed
    // They are visually identical but byte-different
    const h1 = hashContent(nfc);
    const h2 = hashContent(nfd);
    // byte-level preservation: hashes differ if the bytes differ
    expect(h1).not.toBe(h2);
  });
});
