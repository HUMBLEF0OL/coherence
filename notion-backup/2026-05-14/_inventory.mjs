/* eslint-disable */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "notion-backup/2026-05-14";
const inv = [];
for (const f of readdirSync(ROOT)) {
  if (!f.endsWith(".md") || f.startsWith("_")) continue;
  const txt = readFileSync(join(ROOT, f), "utf8");
  const idM = txt.match(/<!-- id: ([a-f0-9-]+) -->/);
  const urlM = txt.match(/<!-- url: (\S+) -->/);
  const titleM = txt.match(/<!-- title: (.+) -->/);
  if (!idM) continue;
  inv.push({
    id: idM[1],
    title: titleM ? titleM[1] : "",
    url: urlM ? urlM[1] : "",
    file: f,
  });
}
inv.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(ROOT, "_inventory.json"), JSON.stringify({ count: inv.length, entries: inv }, null, 2));
console.log(`inventory entries: ${inv.length}`);
