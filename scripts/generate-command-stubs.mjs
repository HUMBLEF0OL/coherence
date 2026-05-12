#!/usr/bin/env node
/**
 * v0.4 M4 — autogen slash-command stubs from `.claude-plugin/plugin.json`.
 *
 * Writes one `commands/<safe-name>.md` per slash command, embedding a
 * `<!-- coherence-command: <name> -->` sentinel that UserPromptSubmit uses
 * to dispatch to the JS handler. Idempotent: short-circuits when the
 * manifest's slashCommands array hasn't changed.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const manifestPath = path.join(rootDir, '.claude-plugin', 'plugin.json');
const commandsDir = path.join(rootDir, 'commands');
const hashFile = path.join(rootDir, '.coherence-stub-hash');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const commands = manifest.slashCommands ?? [];

const hashInput = JSON.stringify(commands);
const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 8);

if (existsSync(hashFile) && readFileSync(hashFile, 'utf8').trim() === hash && existsSync(commandsDir)) {
  console.log(`generate-command-stubs: unchanged (hash=${hash}), skipping.`);
  process.exit(0);
}

mkdirSync(commandsDir, { recursive: true });

for (const cmd of commands) {
  const safeName = cmd.name.replace(/:/g, '-');
  const stubPath = path.join(commandsDir, `${safeName}.md`);
  const content = [
    `# /${cmd.name}`,
    '',
    cmd.description ?? '',
    '',
    `<!-- coherence-command: ${cmd.name} -->`,
    '',
  ].join('\n');
  writeFileSync(stubPath, content, 'utf8');
}

writeFileSync(hashFile, hash + '\n', 'utf8');
console.log(`generate-command-stubs: wrote ${commands.length} stubs (hash=${hash}).`);
