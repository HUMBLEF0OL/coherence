/**
 * M-AUTOGEN-1 — autogen command stubs (v1.1.0 M4).
 *
 * v1.1.0 M4 migration: the custom UserPromptSubmit sentinel dispatcher is
 * gone. Claude Code natively namespaces `commands/<name>.md` as
 * `/<plugin-name>:<name>`. With the plugin renamed to `coherence` (C1),
 * `commands/status.md` auto-routes to `/coherence:status` with no runtime
 * glue. Stubs are now description-only YAML frontmatter — no
 * `<!-- coherence-command: ... -->` sentinel, no body.
 *
 * v1.0.2 backstory: the source of truth moved from
 * `.claude-plugin/plugin.json#slashCommands` (the modern manifest schema
 * rejects that key) to `scripts/commands.config.json`.
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

  it('no stub carries the legacy <!-- coherence-command: ... --> sentinel (M4)', () => {
    for (const c of readCommands()) {
      const filename = c.name.replace(/:/g, '-') + '.md';
      const content = readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');
      expect(content, `Stub ${filename} still carries the legacy sentinel`).not.toContain(
        '<!-- coherence-command:',
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

  it('command names in config are bare (no `coherence:` or `coherence-` prefix) — M4 native namespacing', () => {
    for (const c of readCommands()) {
      expect(c.name, `Command name "${c.name}" must not carry a coherence: prefix`).not.toMatch(
        /^coherence:/,
      );
      expect(c.name, `Command name "${c.name}" must not carry a coherence- prefix`).not.toMatch(
        /^coherence-/,
      );
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
