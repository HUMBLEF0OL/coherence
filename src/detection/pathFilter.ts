/**
 * Path filter: honour coherence/ignore + .gitignore before glob match.
 * NFR-PRIVACY-5, NFR-SECURITY-2/4
 */
import { readFileSync, existsSync, realpathSync } from 'fs';
import path from 'path';
import { normalizePath } from '../state/pathNormaliser.js';

function readIgnoreLines(filePath: string): string[] {
  try {
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`(^|/)${escaped}($|/)`);
}

export class PathFilter {
  private ignorePatterns: RegExp[] = [];

  constructor(projectRoot: string) {
    const coherenceIgnore = path.join(projectRoot, '.claude', 'coherence', 'ignore');
    const gitIgnore = path.join(projectRoot, '.gitignore');

    const patterns = [
      ...readIgnoreLines(coherenceIgnore),
      ...readIgnoreLines(gitIgnore),
      '.env', '.env.*', '*.lock', 'node_modules/**',
    ];

    this.ignorePatterns = patterns.map(globToRegex);
  }

  /** Returns true if the path should be processed (not ignored and within project root). */
  isAllowed(filePath: string, projectRoot: string): boolean {
    // Resolve real path to catch symlinks pointing outside project root
    let realPath: string;
    try {
      realPath = existsSync(filePath) ? realpathSync(filePath) : filePath;
    } catch {
      realPath = filePath;
    }

    const normalizedRoot = normalizePath(projectRoot);
    const normalizedFile = normalizePath(realPath);

    // Security: reject path traversal outside project root
    if (!normalizedFile.startsWith(normalizedRoot + '/') && normalizedFile !== normalizedRoot) {
      return false;
    }

    const relative = path.relative(projectRoot, realPath).split(path.sep).join('/');

    for (const pattern of this.ignorePatterns) {
      if (pattern.test(relative)) return false;
    }

    return true;
  }
}
