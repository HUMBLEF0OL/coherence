/**
 * PHP import-line tokenizer.
 */
export function tokenizeImportLine(line: string): string[] {
  const tokens: string[] = [];
  // use Namespace\ClassName;
  // use Namespace\ClassName as Alias;
  const match = line.match(/^use\s+([\w\\]+)(?:\s+as\s+\w+)?\s*;/);
  if (match?.[1]) tokens.push(match[1]);
  // require/include
  const reqMatch = line.match(/(?:require|include)(?:_once)?\s+['"]([^'"]+)['"]/);
  if (reqMatch?.[1]) tokens.push(reqMatch[1]);
  return tokens.filter(Boolean);
}
