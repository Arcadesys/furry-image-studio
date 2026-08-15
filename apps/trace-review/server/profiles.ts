import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import YAML from 'yaml';
import type { ProfileOption } from '../shared/types.js';

interface Frontmatter {
  id?: unknown;
  display_name?: unknown;
}

function titleCase(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function parseFrontmatter(raw: string): Frontmatter {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!match) {
    return {};
  }
  const parsed = YAML.parse(match[1]);
  return parsed && typeof parsed === 'object' ? parsed as Frontmatter : {};
}

async function loadMarkdownProfile(filePath: string, fallbackId: string): Promise<ProfileOption> {
  const raw = await readFile(filePath, 'utf8');
  const frontmatter = parseFrontmatter(raw);
  const id = typeof frontmatter.id === 'string' && frontmatter.id.trim()
    ? frontmatter.id.trim()
    : fallbackId;
  const displayName = typeof frontmatter.display_name === 'string' && frontmatter.display_name.trim()
    ? frontmatter.display_name.trim()
    : titleCase(id);
  return { id, displayName, raw };
}

export async function loadProfiles(repoRoot: string): Promise<{
  characters: ProfileOption[];
  styles: ProfileOption[];
}> {
  const characterRoot = join(repoRoot, 'assets', 'characters');
  const styleRoot = join(repoRoot, 'assets', 'styles');

  const characterEntries = await readdir(characterRoot, { withFileTypes: true });
  const characters = await Promise.all(
    characterEntries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => loadMarkdownProfile(
        join(characterRoot, entry.name, 'character.md'),
        entry.name,
      )),
  );

  const styleEntries = await readdir(styleRoot, { withFileTypes: true });
  const styles = await Promise.all(
    styleEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_'))
      .map((entry) => loadMarkdownProfile(
        join(styleRoot, entry.name),
        basename(entry.name, '.md'),
      )),
  );

  return {
    characters: characters.sort((left, right) => left.displayName.localeCompare(right.displayName)),
    styles: styles.sort((left, right) => left.displayName.localeCompare(right.displayName)),
  };
}
