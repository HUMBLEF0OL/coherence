#!/usr/bin/env node
/**
 * v1.1.0 M4 — autogen slash-command stubs from `scripts/commands.config.json`.
 *
 * Writes one `commands/<name>.md` per slash command with YAML frontmatter
 * (description). Idempotent: short-circuits when the config hasn't changed.
 *
 * v1.1.0 M4 migration: the custom UserPromptSubmit sentinel dispatcher
 * (`src/hooks/commandDispatch.ts` and the `<!-- coherence-command: ... -->`
 * sentinel) is gone. Claude Code natively namespaces commands under
 * `commands/<name>.md` as `/<plugin-name>:<name>` — with the plugin renamed
 * to `coherence` (C1), the rendered slash command for `commands/status.md`
 * is `/coherence:status` with no custom routing required.
 *
 * v1.0.2 backstory: the source of truth moved from
 * `.claude-plugin/plugin.json#slashCommands` (rejected by the modern
 * `claude plugin validate` schema) to this separate config under `scripts/`.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const configPath = path.join(rootDir, 'scripts', 'commands.config.json');
const commandsDir = path.join(rootDir, 'commands');
const hashFile = path.join(rootDir, '.coherence-stub-hash');

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const commands = config.commands ?? [];

const hashInput = JSON.stringify(commands);
const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 8);

if (existsSync(hashFile) && readFileSync(hashFile, 'utf8').trim() === hash && existsSync(commandsDir)) {
  console.log(`generate-command-stubs: unchanged (hash=${hash}), skipping.`);
  process.exit(0);
}

mkdirSync(commandsDir, { recursive: true });

function escapeYamlScalar(value) {
  // Always double-quote: descriptions routinely contain `: ` (e.g.,
  // "Show current coherence state: buffer, ..."), and an unquoted YAML
  // plain scalar interprets `: ` as a nested key/value pair. Quoting
  // removes that ambiguity entirely.
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const wantedFilenames = new Set();
for (const cmd of commands) {
  const safeName = cmd.name.replace(/:/g, '-');
  const filename = `${safeName}.md`;
  wantedFilenames.add(filename);
  const stubPath = path.join(commandsDir, filename);
  const desc = cmd.description ?? '';
  const content = [
    '---',
    `description: ${escapeYamlScalar(desc)}`,
    '---',
    '',
  ].join('\n');
  writeFileSync(stubPath, content, 'utf8');
}

// v1.1.0 C3: sweep stubs that no longer match the config. Phase 2's
// command consolidation (propose-*, plan-*, *-statusline → subcommand
// routers) left orphan files in working trees that had been built before
// the rename. Without this sweep, those orphans would survive pulls and
// confuse anyone running `ls commands/`.
let sweptCount = 0;
for (const entry of readdirSync(commandsDir)) {
  if (!entry.endsWith('.md')) continue;
  if (wantedFilenames.has(entry)) continue;
  try {
    unlinkSync(path.join(commandsDir, entry));
    sweptCount += 1;
  } catch {
    /* best-effort: a stale stub we can't remove isn't fatal */
  }
}

writeFileSync(hashFile, hash + '\n', 'utf8');
console.log(
  `generate-command-stubs: wrote ${commands.length} stubs (hash=${hash})` +
    (sweptCount > 0 ? `; swept ${sweptCount} orphan stub(s)` : '') +
    '.',
);
