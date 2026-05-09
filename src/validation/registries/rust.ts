/**
 * Rust import-line tokenizer.
 */
export function tokenizeImportLine(line: string): string[] {
  const tokens: string[] = [];
  // use std::collections::HashMap;
  // use crate::module::{Foo, Bar};
  const match = line.match(/^use\s+([\w::{},\s*]+);/);
  if (match?.[1]) {
    const raw = match[1].replace(/[{}]/g, '');
    for (const part of raw.split(',')) {
      const t = part.trim();
      if (t) tokens.push(t);
    }
  }
  return tokens.filter(Boolean);
}
