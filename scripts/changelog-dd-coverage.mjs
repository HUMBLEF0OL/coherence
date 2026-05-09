/**
 * Build-time check: CHANGELOG.md must mention every DD-001..DD-064 verbatim.
 * CI fails release if any DD ID is missing. DG-5 acceptance criterion.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');
const DD_TOTAL = 64;

const content = readFileSync(CHANGELOG_PATH, 'utf8');

const missing = [];
for (let i = 1; i <= DD_TOTAL; i++) {
  const id = `DD-${String(i).padStart(3, '0')}`;
  if (!content.includes(id)) {
    missing.push(id);
  }
}

if (missing.length > 0) {
  console.error(`[changelog-dd-coverage] FAIL: ${missing.length} DD(s) not mentioned in CHANGELOG.md:`);
  console.error(`  ${missing.join(', ')}`);
  process.exit(1);
} else {
  console.log(`[changelog-dd-coverage] PASS: All DD-001..DD-064 covered in CHANGELOG.md.`);
}
