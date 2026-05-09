/**
 * SG-4: Secret scan — no hardcoded secrets in source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '..', '..', 'src');

// Known secret patterns
const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9_-]{20,}/,  // Anthropic API key pattern
  /AKIA[A-Z0-9]{16}/,            // AWS access key
  /(?<![A-Za-z])ghp_[a-zA-Z0-9]{36}/,  // GitHub PAT
  /(?<![A-Za-z])ghr_[a-zA-Z0-9]{36}/,  // GitHub refresh token
];

function walkDir(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) files.push(...walkDir(full));
      else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.json'))) {
        files.push(full);
      }
    }
  } catch { /* ignore */ }
  return files;
}

describe('SG-4: no hardcoded secrets', () => {
  it('source files contain no hardcoded API keys or tokens', () => {
    const violations: string[] = [];
    const files = walkDir(SRC_DIR);

    for (const file of files) {
      const rel = path.relative(path.resolve(__dirname, '..', '..'), file);
      const content = readFileSync(file, 'utf8');

      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(rel);
          break;
        }
      }
    }

    expect(violations, `Hardcoded secrets found in: ${violations.join(', ')}`).toHaveLength(0);
  });
});
