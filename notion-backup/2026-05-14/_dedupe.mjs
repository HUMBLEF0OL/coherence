/* eslint-disable */
import { readdirSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "notion-backup/2026-05-14";
const byId = new Map(); // id -> [{file, mtime, len}]
for (const f of readdirSync(ROOT)) {
  if (!f.endsWith(".md") || f.startsWith("_")) continue;
  const path = join(ROOT, f);
  const txt = readFileSync(path, "utf8");
  const idM = txt.match(/<!-- id: ([a-f0-9-]+) -->/);
  if (!idM) continue;
  const id = idM[1];
  const stat = statSync(path);
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id).push({ file: f, mtime: stat.mtimeMs, len: txt.length });
}

let removed = 0;
let kept = 0;
for (const [id, list] of byId) {
  // Keep the longest file (most content), prefer newer if tie
  list.sort((a, b) => b.len - a.len || b.mtime - a.mtime);
  const keepFile = list[0].file;
  for (let i = 1; i < list.length; i++) {
    unlinkSync(join(ROOT, list[i].file));
    removed++;
  }
  kept++;
}
console.log(JSON.stringify({ uniqueIds: kept, removedDuplicates: removed }, null, 2));
