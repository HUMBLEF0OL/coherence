/**
 * M-AUTOGEN-1 — autogen command stubs (v0.4 DD-130).
 *
 * v1.0.2 migration: the source of truth moved from
 * `.claude-plugin/plugin.json#slashCommands` (the modern manifest schema
 * rejects that key) to `scripts/commands.config.json`. The dispatch path
 * still keys off the `<!-- coherence-command: <name> -->` sentinel inside
 * each stub, so the runtime contract is unchanged.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const CONFIG_PATH = path.resolve(process.cwd(), 'scripts', 'commands.config.json');
const COMMANDS_DIR = path.resolve(process.cwd(), 'commands');

interface SlashCommandEntry {
  name: string;
  description?: string;
}

interface CommandsConfig {
  commands: SlashCommandEntry[];
}

function readCommands(): SlashCommandEntry[] {
  return (JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as CommandsConfig).commands;
}

describe('M-AUTOGEN-1 — stub autogen', () => {
  it('commands/ directory exists after npm run build', () => {
    expect(existsSync(COMMANDS_DIR)).toBe(true);
  });

  it('1:1 mapping between commands.config.json and commands/<name>.md files', () => {
    for (const c of readCommands()) {
      const filename = c.name.replace(/:/g, '-') + '.md';
      const filePath = path.join(COMMANDS_DIR, filename);
      expect(existsSync(filePath), `Missing stub: commands/${filename}`).toBe(true);
    }
  });

  it('each stub contains the coherence-command sentinel with the original colon name', () => {
    for (const c of readCommands()) {
      const filename = c.name.replace(/:/g, '-') + '.md';
      const content = readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');
      expect(content, `Stub ${filename} missing sentinel`).toContain(
        `<!-- coherence-command: ${c.name} -->`,
      );
    }
  });

  it('every stub has YAML frontmatter with a description (v1.0.2 schema-validate requirement)', () => {
    for (const c of readCommands()) {
      const filename = c.name.replace(/:/g, '-') + '.md';
      const content = readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');
      expect(content.startsWith('---\n'), `Stub ${filename} missing frontmatter`).toBe(true);
      expect(content, `Stub ${filename} missing description`).toMatch(/^description:\s+/m);
    }
  });

  it('second run on unchanged config produces identical stub files (idempotent)', () => {
    const commands = readCommands();
    const firstName = commands[0].name;
    const filename = firstName.replace(/:/g, '-') + '.md';
    const before = readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');

    spawnSync('node', ['scripts/generate-command-stubs.mjs'], { stdio: 'inherit' });

    const after = readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');
    expect(after).toBe(before);
  });
});
