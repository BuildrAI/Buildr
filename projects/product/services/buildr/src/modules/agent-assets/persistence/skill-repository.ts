import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import {
  PROJECT_CAPABILITIES_SCHEMA,
  SKILLS_SCHEMA_V3,
  migrateSkillsManifestDocument,
  parseSkillsManifestDocument,
  validateProjectCapabilitiesDocument,
  validateSkillsManifestDocument,
} from './skill-manifest.ts';

type Dependencies = {
  atomicWriteFile(file: string, content: string): void;
  existsFile(file: string): boolean;
  parseYamlDocument(content: string, label: string): any;
  toPosixRelative(root: string, file: string): string;
  validateSkillManifestEntries(skills: any[], manifestPath: string): void;
};

export function createSkillRepository(dependencies: Dependencies) {
  function manifestDocumentFor(skills: any): any {
    return skills?.__buildrManifestDocument || { schemaVersion: SKILLS_SCHEMA_V3, skills: skills || [] };
  }

  function attachManifestDocument(document: any): any[] {
    const skills = Array.isArray(document.skills) ? document.skills : [];
    Object.defineProperty(skills, '__buildrManifestDocument', { configurable: true, enumerable: false, writable: true, value: document });
    return skills;
  }

  function readSkillManifestDocument(file: string, options: any = {}): any {
    return parseSkillsManifestDocument(file, { migrate: options.migrate !== false, validateContracts: options.validateContracts !== false });
  }

  function readSkillManifest(file: string): any[] {
    return attachManifestDocument(readSkillManifestDocument(file));
  }

  function readSkillManifestSchemaVersion(file: string): string | null {
    if (!dependencies.existsFile(file)) return null;
    return dependencies.parseYamlDocument(fs.readFileSync(file, 'utf8'), dependencies.toPosixRelative(process.cwd(), file)).schemaVersion || null;
  }

  function renderSkillsManifestYaml(skills: any, options: any = {}): string {
    const source = Array.isArray(skills) ? manifestDocumentFor(skills) : skills;
    const document = migrateSkillsManifestDocument({ ...source, skills: Array.isArray(skills) ? skills : (source.skills || []) }, options);
    return YAML.stringify(document, { lineWidth: 0 });
  }

  function renderProjectCapabilitiesYaml(document: any = {}): string {
    const normalized = {
      schemaVersion: PROJECT_CAPABILITIES_SCHEMA,
      requires: document.requires || [], bindings: document.bindings || [], skills: document.skills || [],
    };
    validateProjectCapabilitiesDocument(normalized, 'capabilities.yml');
    return YAML.stringify(normalized, { lineWidth: 0 });
  }

  function skillsManifestPath(scopeRoot: string): string {
    return path.join(scopeRoot, 'skills', 'manifest.yml');
  }

  function readSkillsManifestForWrite(scopeRoot: string): any[] {
    const file = skillsManifestPath(scopeRoot);
    if (!dependencies.existsFile(file)) return attachManifestDocument(migrateSkillsManifestDocument({ skills: [] }, { manifestPath: file }));
    const skills = readSkillManifest(file);
    dependencies.validateSkillManifestEntries(skills, file);
    validateSkillsManifestDocument(manifestDocumentFor(skills), file);
    return skills;
  }

  function writeSkillsManifest(scopeRoot: string, skills: any[]): string {
    const file = skillsManifestPath(scopeRoot);
    const document = manifestDocumentFor(skills);
    document.skills = skills;
    const migrated = migrateSkillsManifestDocument(document, { manifestPath: file });
    validateSkillsManifestDocument(migrated, file);
    dependencies.atomicWriteFile(file, YAML.stringify(migrated, { lineWidth: 0 }));
    Object.defineProperty(skills, '__buildrManifestDocument', { configurable: true, enumerable: false, writable: true, value: migrated });
    return file;
  }

  return Object.freeze({ manifestDocumentFor, attachManifestDocument, readSkillManifestDocument, readSkillManifest, readSkillManifestSchemaVersion, renderSkillsManifestYaml, renderProjectCapabilitiesYaml, skillsManifestPath, readSkillsManifestForWrite, writeSkillsManifest });
}
