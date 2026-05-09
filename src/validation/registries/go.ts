/**
 * Go import-line tokenizer.
 */
export function tokenizeImportLine(line: string): string[] {
  const tokens: string[] = [];
  // import "package/path"
  // import alias "package/path"
  const match = line.match(/^\s*(?:\w+\s+)?["']([^"']+)["']/);
  if (match?.[1]) tokens.push(match[1]);
  return tokens;
}
