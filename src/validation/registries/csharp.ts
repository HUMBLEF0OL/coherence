/**
 * C# import-line tokenizer.
 */
export function tokenizeImportLine(line: string): string[] {
  const tokens: string[] = [];
  // using System.Collections.Generic;
  // using alias = Namespace.Class;
  const match = line.match(/^using\s+(?:\w+\s*=\s*)?([\w.]+)\s*;/);
  if (match?.[1]) tokens.push(match[1]);
  return tokens;
}
