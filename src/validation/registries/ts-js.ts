/**
 * TypeScript/JavaScript import-line tokenizer.
 */
export function tokenizeImportLine(line: string): string[] {
  // Match: import { foo, bar } from 'module'
  // Match: import foo from 'module'
  // Match: import * as foo from 'module'
  // Match: require('module')
  const tokens: string[] = [];

  const fromMatch = line.match(/from\s+['"]([^'"]+)['"]/);
  if (fromMatch?.[1]) tokens.push(fromMatch[1]);

  const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
  if (requireMatch?.[1]) tokens.push(requireMatch[1]);

  // Named imports: { foo, bar, baz }
  const namedMatch = line.match(/\{([^}]+)\}/);
  if (namedMatch?.[1]) {
    for (const name of namedMatch[1].split(',')) {
      const t = name.trim().split(/\s+as\s+/)[0]?.trim();
      if (t) tokens.push(t);
    }
  }

  return tokens.filter(Boolean);
}
