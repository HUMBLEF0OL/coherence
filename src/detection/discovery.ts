/**
 * File discovery restricted to:
 *   - Skills:  .claude/skills/*\/SKILL.md
 *   - Agents:  .claude/agents/*.md
 * FR-DETECT-13, DD-040
 */
import { readdirSync, existsSync, statSync } from 'fs';
import path from 'path';

export interface DiscoveredFile {
  path: string;
  type: 'skill' | 'agent' | 'doc';
}

export function discoverFiles(projectRoot: string): DiscoveredFile[] {
  const results: DiscoveredFile[] = [];

  // Skills: .claude/skills/*/SKILL.md
  const skillsDir = path.join(projectRoot, '.claude', 'skills');
  if (existsSync(skillsDir)) {
    try {
      for (const entry of readdirSync(skillsDir)) {
        const skillFile = path.join(skillsDir, entry, 'SKILL.md');
        if (existsSync(skillFile) && statSync(skillFile).isFile()) {
          results.push({ path: skillFile, type: 'skill' });
        }
      }
    } catch { /* ignore */ }
  }

  // Agents: .claude/agents/*.md
  const agentsDir = path.join(projectRoot, '.claude', 'agents');
  if (existsSync(agentsDir)) {
    try {
      for (const entry of readdirSync(agentsDir)) {
        if (entry.endsWith('.md')) {
          const agentFile = path.join(agentsDir, entry);
          if (statSync(agentFile).isFile()) {
            results.push({ path: agentFile, type: 'agent' });
          }
        }
      }
    } catch { /* ignore */ }
  }

  // CLAUDE.md at project root
  const claudeMd = path.join(projectRoot, 'CLAUDE.md');
  if (existsSync(claudeMd)) {
    results.push({ path: claudeMd, type: 'doc' });
  }

  return results;
}
