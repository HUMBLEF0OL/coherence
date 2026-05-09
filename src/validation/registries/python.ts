/**
 * Python import-line tokenizer.
 */
export function tokenizeImportLine(line: string): string[] {
  const tokens: string[] = [];

  // from module import name1, name2
  const fromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
  if (fromMatch) {
    if (fromMatch[1]) tokens.push(fromMatch[1]);
    const names = fromMatch[2]?.replace(/[()]/g, '') ?? '';
    for (const n of names.split(',')) {
      const t = n.trim().split(/\s+as\s+/)[0]?.trim();
      if (t) tokens.push(t);
    }
    return tokens;
  }

  // import module
  const importMatch = line.match(/^import\s+([\w.,\s]+)/);
  if (importMatch?.[1]) {
    for (const part of importMatch[1].split(',')) {
      const t = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (t) tokens.push(t);
    }
  }

  return tokens.filter(Boolean);
}
