/* eslint-disable */
// Walk all backed-up md + raw json files, extract page URLs referenced as
// children/mentions, and emit a list of IDs not yet backed up.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "notion-backup/2026-05-14";

function uuidFromCompact(compact) {
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

const haveIds = new Set();
const haveByFile = new Map();
for (const f of readdirSync(ROOT)) {
  if (!f.endsWith(".md")) continue;
  const txt = readFileSync(join(ROOT, f), "utf8");
  const m = txt.match(/<!-- id: ([a-f0-9-]+) -->/);
  if (m) {
    const id = m[1].replace(/-/g, "");
    haveIds.add(id);
    haveByFile.set(id, f);
  }
}

// Now scan all md + raw json for page URLs that look like 32-hex notion IDs
const referenced = new Map(); // compactId -> {url, title?, refsFrom: Set<file>}
const urlPattern = /https?:\/\/[a-z0-9.]*notion\.so\/[a-zA-Z0-9-]*([a-f0-9]{32})/g;

function scan(dir, files, includeFn) {
  for (const f of readdirSync(dir)) {
    if (!includeFn(f)) continue;
    const txt = readFileSync(join(dir, f), "utf8");
    let mm;
    while ((mm = urlPattern.exec(txt))) {
      const id = mm[1];
      if (!referenced.has(id)) referenced.set(id, { url: mm[0], refsFrom: new Set() });
      referenced.get(id).refsFrom.add(f);
    }
    // Also try to capture titles from <page url="..."> ... </page>
    const pageTagRx = /<page url="https?:\/\/[a-z0-9.]*notion\.so\/[a-zA-Z0-9-]*([a-f0-9]{32})[^"]*"[^>]*>([^<]*)<\/page>/g;
    let pm;
    while ((pm = pageTagRx.exec(txt))) {
      const id = pm[1];
      const title = pm[2].trim();
      if (!referenced.has(id)) referenced.set(id, { url: `https://www.notion.so/${id}`, refsFrom: new Set() });
      const r = referenced.get(id);
      if (!r.title) r.title = title;
      r.refsFrom.add(f);
    }
  }
}

scan(ROOT, null, (f) => f.endsWith(".md"));
scan(join(ROOT, "_raw"), null, (f) => f.endsWith(".json"));

const pending = [];
for (const [id, info] of referenced) {
  if (!haveIds.has(id)) {
    pending.push({
      id: uuidFromCompact(id),
      idCompact: id,
      url: info.url,
      title: info.title || "",
      refsFrom: Array.from(info.refsFrom).slice(0, 3),
    });
  }
}

// Sort: prioritise ones with titles
pending.sort((a, b) => (b.title ? 1 : 0) - (a.title ? 1 : 0));

const result = {
  haveCount: haveIds.size,
  pendingCount: pending.length,
  pending,
};
writeFileSync(join(ROOT, "_walk-progress.json"), JSON.stringify(result, null, 2));
console.log(`have: ${haveIds.size}, pending: ${pending.length}`);
console.log("First 30 pending:");
for (const p of pending.slice(0, 30)) console.log(`  ${p.idCompact}  ${p.title || "(no title)"}`);
