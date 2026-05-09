/**
 * Ruby import-line tokenizer.
 */
export function tokenizeImportLine(line: string): string[] {
  const tokens: string[] = [];
  // require 'module'
  // require_relative './module'
  const match = line.match(/^require(?:_relative)?\s+['"]([^'"]+)['"]/);
  if (match?.[1]) tokens.push(match[1]);
  return tokens;
}
