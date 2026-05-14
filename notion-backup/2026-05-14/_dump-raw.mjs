/* eslint-disable */
// Convert chat-session-resources content.json artifacts into backup MD files.
// Each content.json has shape { metadata, title, url, text } from notion-fetch.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RAW = "notion-backup/2026-05-14/_raw";
const OUT = "notion-backup/2026-05-14";

function slug(title, id) {
  let s = (title || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!s) s = id.replace(/-/g, "").slice(0, 12);
  return s;
}

const usedSlugs = new Set();
for (const f of readdirSync(OUT)) {
  if (f.endsWith(".md")) usedSlugs.add(f.replace(/\.md$/, ""));
}

let written = 0;
let skipped = 0;
const inventory = [];
for (const f of readdirSync(RAW)) {
  if (!f.endsWith(".json")) continue;
  const raw = JSON.parse(readFileSync(join(RAW, f), "utf8"));
  const url = raw.url || "";
  const title = raw.title || "untitled";
  const text = raw.text || "";
  const idMatch = url.match(/notion\.so\/([a-f0-9]{32})/);
  if (!idMatch) {
    skipped++;
    continue;
  }
  const idCompact = idMatch[1];
  const id = `${idCompact.slice(0, 8)}-${idCompact.slice(8, 12)}-${idCompact.slice(12, 16)}-${idCompact.slice(16, 20)}-${idCompact.slice(20)}`;

  // Extract <content>...</content>
  const m = text.match(/<content>\n?([\s\S]*?)\n?<\/content>/);
  const body = m ? m[1] : text;

  let s = slug(title, id);
  let n = 1;
  let candidate = s;
  while (usedSlugs.has(candidate)) {
    // If the same URL already maps here we keep; else rename
    candidate = `${s}-${++n}`;
  }
  usedSlugs.add(candidate);
  const outPath = join(OUT, `${candidate}.md`);
  if (existsSync(outPath)) {
    skipped++;
    inventory.push({ id, title, url, slug: candidate, status: "exists" });
    continue;
  }
  const out = `<!-- url: ${url} -->\n<!-- id: ${id} -->\n<!-- title: ${title} -->\n${body}\n`;
  writeFileSync(outPath, out);
  written++;
  inventory.push({ id, title, url, slug: candidate, status: "written" });
}

console.log(JSON.stringify({ written, skipped, total: inventory.length }, null, 2));
writeFileSync(join(OUT, "_raw_dump_log.json"), JSON.stringify(inventory, null, 2));
