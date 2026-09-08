import fs from 'node:fs';
import path from 'node:path';

type Dependencies = {
  atomicWriteFile(file: string, content: string, encoding: BufferEncoding): void;
  existsFile(file: string): boolean;
  isPlainObject(value: unknown): boolean;
  isValidAssetId(value: unknown): boolean;
  normalizeRelativePathForBuildr(value: string, message: string): string;
  parseYamlDocument(content: string, label: string): any;
  quoteYaml(value: unknown): string;
};

export function createRuleManifestRepository(dependencies: Dependencies) {
  function rulesManifestPath(scopeRoot: string): string {
    return path.join(scopeRoot, 'rules', 'manifest.yml');
  }

  function parseRulesManifestYaml(content: string): any {
    return dependencies.parseYamlDocument(content, 'rules/manifest.yml');
  }

  function renderRulesManifestYaml(manifest: any): string {
    const lines = ['schemaVersion: buildr.rules/v1'];
    if (!manifest.rules || manifest.rules.length === 0) return `${[...lines, 'rules: []'].join('\n')}\n`;
    lines.push('rules:');
    for (const rule of manifest.rules) {
      lines.push(`  - id: ${dependencies.quoteYaml(rule.id)}`);
      for (const key of ['source', 'path', 'description']) if (rule[key] !== undefined) lines.push(`    ${key}: ${dependencies.quoteYaml(rule[key])}`);
      if (rule.enabled !== undefined) lines.push(`    enabled: ${dependencies.quoteYaml(Boolean(rule.enabled))}`);
      if (rule.required !== undefined) lines.push(`    required: ${dependencies.quoteYaml(Boolean(rule.required))}`);
      for (const key of ['state', 'reason']) if (rule[key] !== undefined) lines.push(`    ${key}: ${dependencies.quoteYaml(rule[key])}`);
    }
    return `${lines.join('\n')}\n`;
  }

  function validateRulesManifest(manifest: any): string[] {
    const errors: string[] = [];
    if (manifest.schemaVersion !== 'buildr.rules/v1') errors.push('rules manifest schemaVersion must be buildr.rules/v1.');
    if (!Array.isArray(manifest.rules)) return [...errors, 'rules manifest must declare rules as an array.'];
    const ids = new Set<string>();
    const allowedKeys = new Set(['id', 'source', 'path', 'description', 'enabled', 'required', 'state', 'reason']);
    for (const [index, rule] of manifest.rules.entries()) {
      const label = `rules[${index}]`;
      if (!dependencies.isPlainObject(rule)) { errors.push(`${label} must be an object.`); continue; }
      for (const key of Object.keys(rule)) if (!allowedKeys.has(key)) errors.push(`${label}.${key} is not a supported rules manifest field.`);
      if (!dependencies.isValidAssetId(rule.id)) errors.push(`${label}.id must contain only letters, digits, dots, underscores, or dashes.`);
      else if (ids.has(rule.id)) errors.push(`Duplicate rule id: ${rule.id}.`);
      else ids.add(rule.id);
      if (!['buildr', 'workspace', 'project', 'service'].includes(rule.source)) errors.push(`${label}.source must be buildr, workspace, project, or service.`);
      if (!rule.path || typeof rule.path !== 'string') errors.push(`${label}.path is required.`);
      else {
        dependencies.normalizeRelativePathForBuildr(rule.path, `${label}.path must stay relative: ${rule.path}`);
        if (!rule.path.endsWith('.md')) errors.push(`${label}.path must point to a Markdown file.`);
      }
      if (!rule.description || typeof rule.description !== 'string') errors.push(`${label}.description is required and must describe when to read the rule.`);
      if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') errors.push(`${label}.enabled must be a boolean.`);
      if (rule.required !== undefined && typeof rule.required !== 'boolean') errors.push(`${label}.required must be a boolean.`);
      if (rule.state !== undefined && !['installed', 'modified', 'uninstalled', 'missing'].includes(rule.state)) errors.push(`${label}.state must be installed, modified, uninstalled, or missing.`);
    }
    return errors;
  }

  function readRulesManifestForWrite(scopeRoot: string): any {
    const file = rulesManifestPath(scopeRoot);
    if (!dependencies.existsFile(file)) return { schemaVersion: 'buildr.rules/v1', rules: [] };
    const manifest = parseRulesManifestYaml(fs.readFileSync(file, 'utf8'));
    const errors = validateRulesManifest(manifest);
    if (errors.length) throw new Error(`rules/manifest.yml is invalid:\n- ${errors.join('\n- ')}`);
    return manifest;
  }

  function writeRulesManifest(scopeRoot: string, manifest: any): string {
    const file = rulesManifestPath(scopeRoot);
    dependencies.atomicWriteFile(file, renderRulesManifestYaml(manifest), 'utf8');
    return file;
  }

  return Object.freeze({ rulesManifestPath, parseRulesManifestYaml, renderRulesManifestYaml, validateRulesManifest, readRulesManifestForWrite, writeRulesManifest });
}
