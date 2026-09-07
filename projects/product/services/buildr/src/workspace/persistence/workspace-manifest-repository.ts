import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import { createWorkspace } from '../domain/workspace.ts';

export const WORKSPACE_SCHEMA_V1 = 'buildr.workspace/v1';
export const WORKSPACE_DESCRIPTION_TODO = 'TODO: 请补充 Workspace 的管理范围和用途。';

export type WorkspaceManifestRepositoryRuntime = {
  assertInitializedBuildrWorkspace(root: string): void;
  existsFile(file: string): boolean;
  parseYamlDocument(content: string, label: string): any;
  atomicWriteFile(file: string, content: string): void;
};

const CANONICAL_FIELDS = new Set(['schemaVersion', 'id', 'name', 'description', 'kind', 'profile', 'runtime']);

function parseYaml(content: any, label: any) {
  const document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
  if (document.errors.length) {
    throw new Error(`${label} is invalid YAML: ${document.errors.map((error: any) => error.message).join('; ')}`);
  }
  const value = document.toJS({ mapAsMap: false });
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a YAML mapping.`);
  }
  return value;
}

function requiredText(value: any, field: any, label: any) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label}.${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalCompatibilityText(value: any, field: any, label: any) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label}.${field} must be a non-empty string when provided.`);
  }
  return value.trim();
}

export function parseWorkspaceManifest(content: any, label: any = '.buildr/workspace.yml') {
  const document = parseYaml(content, label);
  const compatibility = {
    kind: optionalCompatibilityText(document.kind, 'kind', label),
    profile: optionalCompatibilityText(document.profile, 'profile', label),
  };

  if (document.schemaVersion === WORKSPACE_SCHEMA_V1) {
    for (const field of Object.keys(document)) {
      if (!CANONICAL_FIELDS.has(field)) {
        throw new Error(`${label}.${field} is not a supported Workspace metadata field.`);
      }
    }
    return {
      canonical: true,
      migrationRequired: false,
      schemaVersion: WORKSPACE_SCHEMA_V1,
      workspace: createWorkspace(document),
      compatibility,
      document,
    };
  }

  if (document.schemaVersion === undefined || String(document.schemaVersion) === '1') {
    return {
      canonical: false,
      migrationRequired: true,
      schemaVersion: document.schemaVersion ?? null,
      workspace: {
        id: null,
        name: requiredText(document.name, 'name', label),
        description: typeof document.description === 'string' ? document.description.trim() : '',
      },
      compatibility,
      document,
    };
  }

  throw new Error(`${label}.schemaVersion must be 1, omitted for a legacy Workspace, or ${WORKSPACE_SCHEMA_V1}.`);
}

export function renderWorkspaceManifest({ workspace, compatibility = {} }: any) {
  const canonical = createWorkspace(workspace);
  const document: any = {
    schemaVersion: WORKSPACE_SCHEMA_V1,
    id: canonical.id,
    name: canonical.name,
    description: canonical.description,
  };
  if (compatibility.kind !== undefined) {
    document.kind = optionalCompatibilityText(compatibility.kind, 'kind', 'Workspace metadata');
  }
  if (compatibility.profile !== undefined) {
    document.profile = optionalCompatibilityText(compatibility.profile, 'profile', 'Workspace metadata');
  }
  return YAML.stringify(document, { lineWidth: 0 });
}

export function workspaceManifestRevision(content: any) {
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function createWorkspaceManifestRepository(runtime: WorkspaceManifestRepositoryRuntime) {
  function workspaceMetadataPath(targetRoot: any) {
    return path.join(path.resolve(targetRoot), '.buildr', 'workspace.yml');
  }

  function workspaceSkillsManifestPath(targetRoot: any) {
    return path.join(path.resolve(targetRoot), 'skills', 'manifest.yml');
  }

  function readWorkspacePersistence(targetRoot: any) {
    const root = path.resolve(targetRoot);
    runtime.assertInitializedBuildrWorkspace(root);
    const metadataPath = workspaceMetadataPath(root);
    const skillsPath = workspaceSkillsManifestPath(root);
    const metadataContent = fs.readFileSync(metadataPath, 'utf8');
    const metadata = parseWorkspaceManifest(metadataContent);
    const skillsContent = runtime.existsFile(skillsPath) ? fs.readFileSync(skillsPath, 'utf8') : null;
    const skills = skillsContent === null
      ? { schemaVersion: 'buildr.skills/v3', workspaceId: null, skills: [] }
      : runtime.parseYamlDocument(skillsContent, 'skills/manifest.yml');
    return {
      root,
      metadataPath,
      skillsPath,
      metadataContent,
      metadata,
      skillsContent,
      skills: { ...skills, workspaceId: skills.workspaceId ?? null },
      revision: workspaceManifestRevision(metadataContent),
    };
  }

  function writeWorkspaceManifest(file: any, content: any) {
    runtime.atomicWriteFile(file, content);
  }

  return Object.freeze({
    workspaceMetadataPath,
    workspaceSkillsManifestPath,
    readWorkspacePersistence,
    writeWorkspaceManifest,
    parseWorkspaceManifest,
    renderWorkspaceManifest,
    workspaceManifestRevision,
  });
}

export type WorkspaceRepository = ReturnType<typeof createWorkspaceManifestRepository>;
