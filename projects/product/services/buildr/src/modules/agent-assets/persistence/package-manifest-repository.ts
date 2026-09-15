import fs from 'node:fs';
import path from 'node:path';

export function createPackageManifestRepository(deps: { resourcesRoot(): string; existsFile(file: string): boolean; parseYamlDocument(text: string, label: string): any }) {
  const { resourcesRoot, existsFile, parseYamlDocument } = deps;
  function readPackageManifest() {
    const manifestPath = path.join(resourcesRoot(), 'manifest.yml');
    if (!existsFile(manifestPath)) {
      throw new Error(`Package manifest not found: ${manifestPath}`);
    }

    const parsed = parseYamlDocument(fs.readFileSync(manifestPath, 'utf8'), 'resources/manifest.yml');
    return {
      include: [],
      agentSkills: [],
      skillSources: [],
      components: [],
      workspaceDirectories: [],
      workspaceFiles: [],
      projectDirectories: [],
      projectFiles: [],
      templateVariables: [],
      forbiddenPatterns: [],
      ...parsed,
      builtins: {
        rules: parsed.builtins?.rules || [],
        skills: parsed.builtins?.skills || [],
        commands: parsed.builtins?.commands || [],
      },
    };
  }

  function parseManifestFileEntry(entry: string, section: string) {
    const match = entry.match(/^(.+?)\s*=>\s*(.+?)(?:\s+(copy|render))?$/);
    if (!match) {
      throw new Error(`Invalid ${section} entry: ${entry}`);
    }
    return {
      source: match[1].trim(),
      target: match[2].trim(),
      mode: match[3] ?? 'copy',
      raw: entry,
    };
  }

  return Object.freeze({ readPackageManifest, parseManifestFileEntry });
}
