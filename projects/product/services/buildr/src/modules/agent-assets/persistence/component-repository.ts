import fs from 'node:fs';
import path from 'node:path';

type Dependencies = {
  atomicWriteFile(file: string, content: string): void;
  existsFile(file: string): boolean;
  isValidAssetId(value: unknown): boolean;
  normalizeRelativePathForBuildr(value: string, message: string): string;
  parseYamlDocument(content: string, label: string): any;
  parseComponentDefinitionYaml(content: string): any;
  quoteYaml(value: unknown): string;
  validateComponentDefinition(definition: any, expectedId?: string | null): string[];
  workspaceSymlinkSegment(targetRoot: string, relativePath: string): string | null;
};

export function createComponentRepository(dependencies: Dependencies) {
  function componentRegistryPath(targetRoot: string): string {
    return path.join(targetRoot, 'components', 'manifest.yml');
  }

  function parseComponentsManifestYaml(content: string): any {
    const manifest = dependencies.parseYamlDocument(content, 'components/manifest.yml');
    if (!Array.isArray(manifest.components)) manifest.components = [];
    return manifest;
  }

  function validateComponentsManifest(manifest: any): string[] {
    const errors: string[] = [];
    if (manifest.schemaVersion !== 'buildr.components/v1') errors.push('components manifest schemaVersion must be buildr.components/v1.');
    if (!Array.isArray(manifest.components)) return [...errors, 'components manifest must declare components as an array.'];
    const ids = new Set<string>();
    const allowed = new Set(['id', 'source', 'path', 'enabled', 'required', 'state', 'reason']);
    for (const [index, entry] of manifest.components.entries()) {
      const label = `components[${index}]`;
      for (const key of Object.keys(entry)) if (!allowed.has(key)) errors.push(`${label}.${key} is not supported.`);
      if (!entry.id || !dependencies.isValidAssetId(entry.id)) errors.push(`${label}.id is invalid.`);
      else if (ids.has(entry.id)) errors.push(`Duplicate component id: ${entry.id}.`);
      else ids.add(entry.id);
      if (!['buildr', 'workspace'].includes(entry.source)) errors.push(`${label}.source must be buildr or workspace.`);
      if (!entry.path || typeof entry.path !== 'string') errors.push(`${label}.path is required.`);
      else try {
        const normalized = dependencies.normalizeRelativePathForBuildr(entry.path, `${label}.path must stay inside components/.`);
        if (!entry.source || !entry.id || normalized.split(path.sep).join('/') !== `components/${entry.source}/${entry.id}`) errors.push(`${label}.path must be components/<source>/<id>.`);
      } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
      if (typeof entry.enabled !== 'boolean') errors.push(`${label}.enabled must be boolean.`);
      if (typeof entry.required !== 'boolean') errors.push(`${label}.required must be boolean.`);
      if (!['installed', 'uninstalled'].includes(entry.state)) errors.push(`${label}.state must be installed or uninstalled.`);
      if (entry.reason !== undefined && typeof entry.reason !== 'string') errors.push(`${label}.reason must be a string.`);
    }
    return errors;
  }

  function renderComponentsManifestYaml(manifest: any): string {
    const lines = ['schemaVersion: buildr.components/v1'];
    if (!manifest.components?.length) return `${lines.concat('components: []').join('\n')}\n`;
    lines.push('components:');
    for (const entry of manifest.components) {
      lines.push(`  - id: ${dependencies.quoteYaml(entry.id)}`);
      for (const key of ['source', 'path']) if (entry[key] !== undefined) lines.push(`    ${key}: ${dependencies.quoteYaml(entry[key])}`);
      if (entry.enabled !== undefined) lines.push(`    enabled: ${dependencies.quoteYaml(Boolean(entry.enabled))}`);
      if (entry.required !== undefined) lines.push(`    required: ${dependencies.quoteYaml(Boolean(entry.required))}`);
      if (entry.state !== undefined) lines.push(`    state: ${dependencies.quoteYaml(entry.state)}`);
      if (entry.reason !== undefined) lines.push(`    reason: ${dependencies.quoteYaml(entry.reason)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  function readComponentsManifestForWrite(targetRoot: string): any {
    const file = componentRegistryPath(targetRoot);
    const symlink = dependencies.workspaceSymlinkSegment(targetRoot, 'components/manifest.yml');
    if (symlink) throw new Error(`Component registry path crosses a symbolic link: ${symlink}`);
    if (!dependencies.existsFile(file)) return { schemaVersion: 'buildr.components/v1', components: [] };
    const manifest = parseComponentsManifestYaml(fs.readFileSync(file, 'utf8'));
    const errors = validateComponentsManifest(manifest);
    if (errors.length) throw new Error(`components/manifest.yml is invalid:\n- ${errors.join('\n- ')}`);
    return manifest;
  }

  function writeComponentsManifest(targetRoot: string, manifest: any): string {
    const file = componentRegistryPath(targetRoot);
    const symlink = dependencies.workspaceSymlinkSegment(targetRoot, 'components/manifest.yml');
    if (symlink) throw new Error(`Component registry path crosses a symbolic link: ${symlink}`);
    dependencies.atomicWriteFile(file, renderComponentsManifestYaml(manifest));
    return file;
  }

  function readComponentDefinition(file: string, expectedId: string | null = null): any {
    if (!dependencies.existsFile(file)) throw new Error(`Component definition not found: ${file}`);
    const definition = dependencies.parseComponentDefinitionYaml(fs.readFileSync(file, 'utf8'));
    const errors = dependencies.validateComponentDefinition(definition, expectedId);
    if (errors.length) throw new Error(`Component definition is invalid: ${file}\n- ${errors.join('\n- ')}`);
    return definition;
  }

  function componentDefinitionFile(targetRoot: string, entry: any): string {
    return path.join(targetRoot, entry.path, 'component.yml');
  }

  return Object.freeze({ componentRegistryPath, parseComponentsManifestYaml, validateComponentsManifest, renderComponentsManifestYaml, readComponentsManifestForWrite, writeComponentsManifest, readComponentDefinition, componentDefinitionFile });
}
