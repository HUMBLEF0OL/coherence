/**
 * M-AUTOGEN-1 — autogen command stubs (v0.4 DD-130).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const MANIFEST_PATH = path.resolve(process.cwd(), '.claude-plugin', 'plugin.json');
const COMMANDS_DIR = path.resolve(process.cwd(), 'commands');

interface SlashCommandEntry {
  name: string;
}

describe('M-AUTOGEN-1 — stub autogen', () => {
  it('commands/ directory exists after npm run build', () => {
    expect(existsSync(COMMANDS_DIR)).toBe(true);
  });

  it('1:1 mapping between plugin.json slashCommands and commands/<name>.md files', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      slashCommands: SlashCommandEntry[];
    };
    for (const c of manifest.slashCommands) {
      const filename = c.name.replace(/:/g, '-') + '.md';
      const filePath = path.join(COMMANDS_DIR, filename);
      expect(existsSync(filePath), `Missing stub: commands/${filename}`).toBe(true);
    }
  });

  it('each stub contains the coherence-command sentinel with the original colon name', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      slashCommands: SlashCommandEntry[];
    };
    for (const c of manifest.slashCommands) {
      const filename = c.name.replace(/:/g, '-') + '.md';
      const content = readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');
      expect(content, `Stub ${filename} missing sentinel`).toContain(
        `<!-- coherence-command: ${c.name} -->`,
      );
    }
  });

  it('second run on unchanged manifest produces identical stub files (idempotent)', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      slashCommands: SlashCommandEntry[];
    };
    const firstName = manifest.slashCommands[0].name;
    const filename = firstName.replace(/:/g, '-') + '.md';
    const before = readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');

    spawnSync('node', ['scripts/generate-command-stubs.mjs'], { stdio: 'inherit' });

    const after = readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');
    expect(after).toBe(before);
  });
});
