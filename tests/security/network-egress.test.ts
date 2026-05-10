/**
 * NFR-PRIVACY-3: All outbound HTTPS calls must originate only from src/llm/client.ts.
 * No hook, state module, or command may make direct network requests.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '..', '..', 'src');
const ALLOWED_EGRESS_FILE = 'src/llm/client.ts';

// Patterns that suggest outbound network calls
const NETWORK_CALL_PATTERNS = [
  /https?:\/\//,
  /new\s+(?:XMLHttpRequest|WebSocket)/,
  /require\(['"]https?['"]\)/,
  /import.*['"]https?['"]/,
  /fetch\s*\(/,
  /http\.get\s*\(/,
  /http\.request\s*\(/,
  /axios\s*\(/,
];

function walkDir(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walkDir(full));
    else if (e.isFile() && e.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

describe('NFR-PRIVACY-3: network egress', () => {
  it('only src/llm/client.ts makes outbound HTTPS calls', () => {
    const violations: string[] = [];
    const files = walkDir(SRC_DIR);

    for (const file of files) {
      const rel = path.relative(path.resolve(__dirname, '..', '..'), file).replace(/\\/g, '/');
      if (rel === ALLOWED_EGRESS_FILE) continue;

      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

        for (const pattern of NETWORK_CALL_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`${rel}:${i + 1} — ${line.trim()}`);
            break;
          }
        }
      }
    }

    expect(violations, `Unauthorized network calls found:\n${violations.join('\n')}`).toHaveLength(0);
  });
});
