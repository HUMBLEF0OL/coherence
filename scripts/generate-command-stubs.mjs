#!/usr/bin/env node
/**
 * v1.0.2 — autogen slash-command stubs from `scripts/commands.config.json`.
 *
 * Writes one `commands/<safe-name>.md` per slash command with YAML
 * frontmatter (description) plus a `<!-- coherence-command: <name> -->`
 * sentinel that UserPromptSubmit dispatches on. Idempotent: short-circuits
 * when the config hasn't changed.
 *
 * v1.0.2 migration: the source of truth moved from
 * `.claude-plugin/plugin.json#slashCommands` (rejected by the modern
 * `claude plugin validate` schema as an unrecognized key) to a separate
 * config under `scripts/`. The runtime dispatch path (UserPromptSubmit ->
 * `src/hooks/commandDispatch.ts`) keys off the sentinel inside each stub,
 * so this generator is the only place that reads the list.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
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

for (const cmd of commands) {
  const safeName = cmd.name.replace(/:/g, '-');
  const stubPath = path.join(commandsDir, `${safeName}.md`);
  const desc = cmd.description ?? '';
  const content = [
    '---',
    `description: ${escapeYamlScalar(desc)}`,
    '---',
    '',
    `<!-- coherence-command: ${cmd.name} -->`,
    '',
  ].join('\n');
  writeFileSync(stubPath, content, 'utf8');
}

writeFileSync(hashFile, hash + '\n', 'utf8');
console.log(`generate-command-stubs: wrote ${commands.length} stubs (hash=${hash}).`);
