/**
 * Java import-line tokenizer.
 */
export function tokenizeImportLine(line: string): string[] {
  const tokens: string[] = [];
  // import com.example.ClassName;
  const match = line.match(/^import\s+(?:static\s+)?([\w.]+)\s*;/);
  if (match?.[1]) tokens.push(match[1]);
  return tokens;
}
