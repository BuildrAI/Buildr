import fs from 'node:fs';
import path from 'node:path';

import { parseVersionConstraint } from '../domain/command-version.ts';

export const PROJECT_COMMANDS_SCHEMA = 'buildr.project-commands/v1';

type Dependencies = {
  atomicWriteFile(file: string, content: string): void;
  existsDirectory(directory: string): boolean;
  existsFile(file: string): boolean;
  isValidAssetId(value: unknown): boolean;
  normalizeRelativePathForBuildr(value: string, message: string): string;
  parseYamlDocument(content: string, label: string): any;
  quoteYaml(value: unknown): string;
  toPosixRelative(root: string, file: string): string;
  workspaceSymlinkSegment(root: string, relative: string): string | null;
};

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createCommandManifestRepository(dependencies: Dependencies) {
  function normalizeCommandCollection(collection: string | null): string | null {
    if (!collection) return null;
    const normalized = dependencies.normalizeRelativePathForBuildr(collection, `Command collection must stay inside commands/: ${collection}`)
      .replace(/^commands\//, '').replace(/\/manifest\.yml$/, '');
    if (!normalized || normalized === 'manifest.yml') throw new Error(`Command collection must name a nested collection: ${collection}`);
    return normalized;
  }

  function commandsManifestPath(targetRoot: string, collection: string | null = null): string {
    const normalized = normalizeCommandCollection(collection);
    return normalized ? path.join(targetRoot, 'commands', normalized, 'manifest.yml') : path.join(targetRoot, 'commands', 'manifest.yml');
  }

  function assertSafeCommandCollectionTarget(targetRoot: string, manifestPath: string): void {
    const symlink = dependencies.workspaceSymlinkSegment(targetRoot, dependencies.toPosixRelative(targetRoot, manifestPath));
    if (symlink) throw new Error(`Command collection path crosses a symbolic link: ${symlink}`);
  }

  function listCommandsManifestPaths(targetRoot: string): string[] {
    const root = path.join(targetRoot, 'commands');
    if (!dependencies.existsDirectory(root)) return [];
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) visit(absolute);
        else if (entry.isFile() && entry.name === 'manifest.yml') files.push(absolute);
      }
    };
    visit(root);
    const rootManifest = commandsManifestPath(targetRoot);
    return files.sort((left, right) => left === rootManifest ? -1 : right === rootManifest ? 1 : left.localeCompare(right));
  }

  function parseCommandsManifestYaml(content: string): any {
    return dependencies.parseYamlDocument(content, 'commands manifest');
  }

  function projectCommandsPath(targetRoot: string, project: string): string {
    return path.join(targetRoot, 'projects', project, 'commands.yml');
  }

  function parseProjectCommandsYaml(content: string, file = 'commands.yml'): any {
    return dependencies.parseYamlDocument(content, file);
  }

  function validateProjectCommandsDocument(document: any): string[] {
    const errors: string[] = [];
    if (!isPlainObject(document)) return ['Project commands document must be an object.'];
    if (document.schemaVersion !== PROJECT_COMMANDS_SCHEMA) errors.push(`Project commands schemaVersion must be ${PROJECT_COMMANDS_SCHEMA}.`);
    if (!Array.isArray(document.requirements)) return [...errors, 'Project commands document must declare requirements as an array.'];
    const ids = new Set<string>();
    const allowedKeys = new Set(['id', 'required', 'version', 'purpose']);
    document.requirements.forEach((requirement: any, index: number) => {
      const label = `requirements[${index}]`;
      if (!isPlainObject(requirement)) { errors.push(`${label} must be an object.`); return; }
      for (const key of Object.keys(requirement)) if (!allowedKeys.has(key)) errors.push(`${label}.${key} is not a supported Project Command requirement field.`);
      if (!dependencies.isValidAssetId(requirement.id)) errors.push(`${label}.id must contain only letters, digits, dots, underscores, or dashes.`);
      else if (ids.has(requirement.id)) errors.push(`Duplicate Project Command requirement id: ${requirement.id}.`);
      else ids.add(requirement.id);
      if (requirement.required !== undefined && typeof requirement.required !== 'boolean') errors.push(`${label}.required must be a boolean.`);
      if (requirement.version !== undefined && (typeof requirement.version !== 'string' || !parseVersionConstraint(requirement.version))) errors.push(`${label}.version is invalid: ${requirement.version}.`);
      if (requirement.purpose !== undefined && typeof requirement.purpose !== 'string') errors.push(`${label}.purpose must be a string when provided.`);
    });
    return errors;
  }

  function renderProjectCommandsYaml(document: any = {}): string {
    const requirements = document.requirements || [];
    const lines = [`schemaVersion: ${PROJECT_COMMANDS_SCHEMA}`];
    if (!requirements.length) return `${lines.concat('requirements: []').join('\n')}\n`;
    lines.push('requirements:');
    for (const requirement of requirements) {
      lines.push(`  - id: ${dependencies.quoteYaml(requirement.id)}`);
      if (requirement.required !== undefined) lines.push(`    required: ${dependencies.quoteYaml(Boolean(requirement.required))}`);
      if (requirement.version !== undefined) lines.push(`    version: ${dependencies.quoteYaml(requirement.version)}`);
      if (requirement.purpose !== undefined) lines.push(`    purpose: ${dependencies.quoteYaml(requirement.purpose)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  function validateCommandsManifest(manifest: any): string[] {
    const errors: string[] = [];
    if (manifest.schemaVersion !== 'buildr.commands/v1') errors.push('commands manifest schemaVersion must be buildr.commands/v1.');
    if (!Array.isArray(manifest.commands)) return [...errors, 'commands manifest must declare commands as an array.'];
    const ids = new Set<string>();
    const allowedCommandKeys = new Set(['id', 'source', 'enabled', 'required', 'state', 'name', 'executable', 'purpose', 'description', 'version', 'installHint', 'reason']);
    const allowedVersionKeys = new Set(['constraint', 'args']);
    manifest.commands.forEach((command: any, index: number) => {
      const label = `commands[${index}]`;
      if (!isPlainObject(command)) { errors.push(`${label} must be an object.`); return; }
      for (const key of Object.keys(command)) if (!allowedCommandKeys.has(key)) errors.push(`${label}.${key} is not a supported commands manifest field.`);
      if (!dependencies.isValidAssetId(command.id)) errors.push(`${label}.id must contain only letters, digits, dots, underscores, or dashes.`);
      else if (ids.has(command.id)) errors.push(`Duplicate command id: ${command.id}.`);
      else ids.add(command.id);
      if (!command.executable || typeof command.executable !== 'string' || /\s/.test(command.executable) || command.executable.includes('/') || command.executable.includes('\\')) {
        if (command.enabled !== false && command.state !== 'uninstalled') errors.push(`${label}.executable must be a command name without whitespace or path separators.`);
      }
      if (!command.purpose || typeof command.purpose !== 'string') errors.push(`${label}.purpose is required.`);
      if (command.source !== undefined && !['buildr', 'workspace', 'project', 'service'].includes(command.source)) errors.push(`${label}.source must be buildr, workspace, project, or service when provided.`);
      if (command.enabled !== undefined && typeof command.enabled !== 'boolean') errors.push(`${label}.enabled must be a boolean.`);
      if (command.required !== undefined && typeof command.required !== 'boolean') errors.push(`${label}.required must be a boolean.`);
      if (command.state !== undefined && !['installed', 'modified', 'uninstalled', 'missing'].includes(command.state)) errors.push(`${label}.state must be installed, modified, uninstalled, or missing.`);
      for (const field of ['name', 'description', 'installHint']) if (command[field] !== undefined && typeof command[field] !== 'string') errors.push(`${label}.${field} must be a string when provided.`);
      if (command.install !== undefined) errors.push(`${label}.install is not supported. Use installHint instead.`);
      if (command.version !== undefined) {
        if (!isPlainObject(command.version)) errors.push(`${label}.version must be an object.`);
        else {
          for (const key of Object.keys(command.version)) if (!allowedVersionKeys.has(key)) errors.push(`${label}.version.${key} is not a supported version field.`);
          if (command.version.constraint !== undefined && (typeof command.version.constraint !== 'string' || !parseVersionConstraint(command.version.constraint))) errors.push(`${label}.version.constraint is invalid: ${command.version.constraint}.`);
          if (!Array.isArray(command.version.args) || !command.version.args.every((argument: unknown) => typeof argument === 'string')) errors.push(`${label}.version.args must be an array of strings.`);
        }
      }
    });
    return errors;
  }

  function renderCommandsManifestYaml(manifest: any): string {
    const lines = ['schemaVersion: buildr.commands/v1'];
    if (!manifest.commands?.length) return `${lines.concat('commands: []').join('\n')}\n`;
    lines.push('commands:');
    for (const command of manifest.commands) {
      lines.push(`  - id: ${dependencies.quoteYaml(command.id)}`);
      if (command.source !== undefined) lines.push(`    source: ${dependencies.quoteYaml(command.source)}`);
      if (command.enabled !== undefined) lines.push(`    enabled: ${dependencies.quoteYaml(Boolean(command.enabled))}`);
      if (command.required !== undefined) lines.push(`    required: ${dependencies.quoteYaml(Boolean(command.required))}`);
      if (command.state !== undefined) lines.push(`    state: ${dependencies.quoteYaml(command.state)}`);
      for (const key of ['name', 'executable', 'purpose', 'description']) if (command[key] !== undefined) lines.push(`    ${key}: ${dependencies.quoteYaml(command[key])}`);
      if (command.version) {
        lines.push('    version:');
        if (command.version.constraint !== undefined) lines.push(`      constraint: ${dependencies.quoteYaml(command.version.constraint)}`);
        lines.push(`      args: ${dependencies.quoteYaml(command.version.args)}`);
      }
      if (command.installHint !== undefined) lines.push(`    installHint: ${dependencies.quoteYaml(command.installHint)}`);
      if (command.reason !== undefined) lines.push(`    reason: ${dependencies.quoteYaml(command.reason)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  function readCommandsManifestForWrite(targetRoot: string, collection: string | null = null): any {
    const file = commandsManifestPath(targetRoot, collection);
    assertSafeCommandCollectionTarget(targetRoot, file);
    if (!dependencies.existsFile(file)) return { schemaVersion: 'buildr.commands/v1', commands: [] };
    const manifest = parseCommandsManifestYaml(fs.readFileSync(file, 'utf8'));
    const errors = validateCommandsManifest(manifest);
    if (errors.length) throw new Error(`${dependencies.toPosixRelative(targetRoot, file)} is invalid:\n- ${errors.join('\n- ')}`);
    return manifest;
  }

  function writeCommandsManifest(targetRoot: string, manifest: any, collection: string | null = null): string {
    const file = commandsManifestPath(targetRoot, collection);
    assertSafeCommandCollectionTarget(targetRoot, file);
    dependencies.atomicWriteFile(file, renderCommandsManifestYaml(manifest));
    return file;
  }

  return Object.freeze({ PROJECT_COMMANDS_SCHEMA, normalizeCommandCollection, commandsManifestPath, projectCommandsPath, assertSafeCommandCollectionTarget, listCommandsManifestPaths, parseCommandsManifestYaml, parseProjectCommandsYaml, validateProjectCommandsDocument, renderProjectCommandsYaml, validateCommandsManifest, renderCommandsManifestYaml, readCommandsManifestForWrite, writeCommandsManifest });
}
