/**
 * v1.0 M2 — text-pattern assertion unit tests (FR-ASSERTS-2).
 */
import { describe, it, expect } from 'vitest';
import {
  has_example,
  no_placeholder_links,
  max_words,
  min_words,
  no_todo_comments,
} from '../../../src/validation/assertions/textPatterns.js';

const SR = 'README.md#install';

describe('has_example', () => {
  it('passes when section contains fenced code block', () => {
    expect(has_example({ sectionRef: SR, content: 'text\n```ts\nfoo();\n```\nmore' }).passed).toBe(true);
  });
  it('fails when section contains no fenced code block', () => {
    expect(has_example({ sectionRef: SR, content: 'just prose' }).passed).toBe(false);
  });
});

describe('no_placeholder_links', () => {
  it('passes when no placeholder links present', () => {
    expect(no_placeholder_links({ sectionRef: SR, content: '[ok](https://example.com) and [self](#anchor)' }).passed).toBe(true);
  });
  it('fails when [text](TODO) present', () => {
    expect(no_placeholder_links({ sectionRef: SR, content: 'See [docs](TODO).' }).passed).toBe(false);
  });
  it('fails when empty url [text]() present', () => {
    expect(no_placeholder_links({ sectionRef: SR, content: '[x]()' }).passed).toBe(false);
  });
});

describe('max_words / min_words', () => {
  const fifty = Array.from({ length: 50 }, (_, i) => `w${i}`).join(' ');

  it('max_words=50 passes for exactly 50 words', () => {
    expect(max_words({ sectionRef: SR, content: fifty }, '50').passed).toBe(true);
  });
  it('max_words=49 fails for 50 words', () => {
    expect(max_words({ sectionRef: SR, content: fifty }, '49').passed).toBe(false);
  });
  it('min_words=50 passes for exactly 50 words', () => {
    expect(min_words({ sectionRef: SR, content: fifty }, '50').passed).toBe(true);
  });
  it('min_words=51 fails for 50 words', () => {
    expect(min_words({ sectionRef: SR, content: fifty }, '51').passed).toBe(false);
  });
  it('non-numeric param results in pass (ignored)', () => {
    expect(max_words({ sectionRef: SR, content: fifty }, 'abc').passed).toBe(true);
  });
});

describe('no_todo_comments', () => {
  it('fails on <!-- TODO marker', () => {
    expect(no_todo_comments({ sectionRef: SR, content: 'pre\n<!-- TODO finish me -->\n' }).passed).toBe(false);
  });
  it('fails on <!-- FIXME marker (case-insensitive)', () => {
    expect(no_todo_comments({ sectionRef: SR, content: 'pre <!-- fixme -->' }).passed).toBe(false);
  });
  it('passes when no marker present', () => {
    expect(no_todo_comments({ sectionRef: SR, content: 'all good' }).passed).toBe(true);
  });
});
