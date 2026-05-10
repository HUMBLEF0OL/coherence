#!/usr/bin/env node
/**
 * v0.3 build helper — copy `src/state/schemas/*.json` into `dist/state/schemas/`.
 *
 * `tsc` does not copy `.json` assets. `src/state/stateStore.ts:loadSchemas()`
 * resolves schemas relative to its compiled module at runtime
 * (`dist/state/stateStore.js`); without this copy, marketplace-installed
 * tarballs would crash on first state read because `require()` cannot find
 * the schema files.
 *
 * Round-2 C5 follow-up. Wired into `npm run build` and re-asserted by
 * `tests/ship/tarball-shape.test.ts`.
 */
import { readdirSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcSchemas = path.join(root, 'src', 'state', 'schemas');
const distSchemas = path.join(root, 'dist', 'state', 'schemas');

function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const sFull = path.join(src, name);
    const dFull = path.join(dst, name);
    const st = statSync(sFull);
    if (st.isDirectory()) {
      copyTree(sFull, dFull);
    } else if (name.endsWith('.json')) {
      copyFileSync(sFull, dFull);
    }
  }
}

if (!existsSync(srcSchemas)) {
  console.error(`[copy-schemas] missing source: ${srcSchemas}`);
  process.exit(1);
}

copyTree(srcSchemas, distSchemas);

const count = countJson(distSchemas);
console.log(`[copy-schemas] copied ${count} schema files → ${path.relative(root, distSchemas)}`);

function countJson(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) n += countJson(full);
    else if (name.endsWith('.json')) n++;
  }
  return n;
}
