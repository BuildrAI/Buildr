import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import { createProject, isProjectCode } from '../domain/project.mjs';

export const PROJECTS_SCHEMA_V1 = 'buildr.projects/v1';
export const PROJECTS_SCHEMA_V2 = 'buildr.projects/v2';

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function closedFields(value, fields, label) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw new Error(`${label}.${key} is not a supported projects/manifest.yml field.`);
  }
}

function parseYaml(content, label) {
  const document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
  if (document.errors.length) throw new Error(`${label} is invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
  return plainObject(document.toJS({ mapAsMap: false }), label);
}

function legacyProject(code, value, workspaceId) {
  const project = plainObject(value, `projects.${code}`);
  const repo = plainObject(project.repo, `projects.${code}.repo`);
  if (!['workspace', 'git'].includes(repo.kind)) throw new Error(`projects.${code}.repo.kind must be workspace or git.`);
  const projectPath = typeof project.path === 'string' && project.path.trim() ? project.path.trim() : `projects/${code}`;
  const source = repo.kind === 'workspace'
    ? { type: 'workspace', path: projectPath }
    : {
      type: 'git',
      path: projectPath,
      git: {
        url: typeof repo.url === 'string' ? repo.url.trim() : '',
        remote: typeof repo.remote === 'string' && repo.remote.trim() ? repo.remote.trim() : 'origin',
        integrationBranch: typeof repo.defaultBranch === 'string' ? repo.defaultBranch.trim() : '',
      },
    };
  if (projectPath !== `projects/${code}`) throw new Error(`projects.${code}.path must be projects/${code}.`);
  const name = typeof project.title === 'string' && project.title.trim() ? project.title.trim() : code;
  const description = typeof project.description === 'string' && project.description.trim()
    ? project.description.trim()
    : `TODO: 补充 Project ${code} 的用途说明。`;
  return {
    id: null,
    workspaceId: workspaceId || null,
    code,
    name,
    description,
    source,
  };
}

export function parseProjectsManifest(content, { workspaceId = null, label = 'projects/manifest.yml' } = {}) {
  const document = parseYaml(content, label);
  const projects = plainObject(document.projects, `${label}.projects`);
  if (document.schemaVersion === PROJECTS_SCHEMA_V2) {
    closedFields(document, new Set(['schemaVersion', 'projects']), label);
    const canonical = Object.entries(projects).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => {
      if (!isProjectCode(key)) throw new Error(`projects.${key} key is invalid.`);
      const project = plainObject(value, `projects.${key}`);
      closedFields(project, new Set(['id', 'workspaceId', 'code', 'name', 'description', 'source']), `projects.${key}`);
      const source = plainObject(project.source, `projects.${key}.source`);
      closedFields(source, new Set(['type', 'root', 'path', 'git']), `projects.${key}.source`);
      if (source.git !== undefined) closedFields(plainObject(source.git, `projects.${key}.source.git`), new Set(['url', 'remote', 'integrationBranch']), `projects.${key}.source.git`);
      const entity = createProject(project);
      if (entity.code !== key) throw new Error(`projects.${key}.code must equal its manifest key.`);
      if (workspaceId && entity.workspaceId !== workspaceId) throw new Error(`projects.${key}.workspaceId must equal the current Workspace id.`);
      return entity;
    });
    const entities = Object.fromEntries(canonical.map((project) => [project.code, project]));
    return { canonical: true, migrationRequired: false, schemaVersion: PROJECTS_SCHEMA_V2, projects: entities, entities, document };
  }
  if (document.schemaVersion === PROJECTS_SCHEMA_V1) {
    const entities = Object.fromEntries(Object.entries(projects).sort(([a], [b]) => a.localeCompare(b)).map(([code, value]) => {
      if (!isProjectCode(code)) throw new Error(`projects.${code} key is invalid.`);
      return [code, legacyProject(code, value, workspaceId)];
    }));
    return { canonical: false, migrationRequired: true, schemaVersion: PROJECTS_SCHEMA_V1, projects: entities, entities, document };
  }
  throw new Error(`${label}.schemaVersion must be ${PROJECTS_SCHEMA_V1} or ${PROJECTS_SCHEMA_V2}.`);
}

export function renderProjectsManifest(projects) {
  const entries = Array.isArray(projects) ? projects : Object.values(projects || {});
  const canonical = entries.map((project) => createProject(project)).sort((a, b) => a.code.localeCompare(b.code));
  const document = { schemaVersion: PROJECTS_SCHEMA_V2, projects: {} };
  for (const project of canonical) {
    document.projects[project.code] = {
      id: project.id,
      workspaceId: project.workspaceId,
      code: project.code,
      name: project.name,
      description: project.description,
      source: project.source.type === 'workspace'
        ? { type: 'workspace', path: project.source.path }
        : { type: 'git', ...(project.source.root === 'attached' ? { root: 'attached' } : {}), path: project.source.path, git: { ...project.source.git } },
    };
  }
  return YAML.stringify(document, { lineWidth: 0 });
}

export function projectManifestRevision(content) {
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function registerProjectManifestRepository(runtime) {
  function projectsManifestPath(targetRoot) {
    return path.join(path.resolve(targetRoot), 'projects', 'manifest.yml');
  }

  function readProjectRegistryPersistence(targetRoot, options = {}) {
    const root = path.resolve(targetRoot);
    runtime.assertInitializedBuildrWorkspace(root);
    const manifestPath = projectsManifestPath(root);
    const content = fs.readFileSync(manifestPath, 'utf8');
    return {
      root,
      manifestPath,
      content,
      revision: projectManifestRevision(content),
      registry: parseProjectsManifest(content, options),
    };
  }

  function writeProjectRegistry(file, projects) {
    runtime.atomicWriteFile(file, renderProjectsManifest(projects));
  }

  Object.assign(runtime, {
    projectsManifestPath,
    readProjectRegistryPersistence,
    writeProjectRegistry,
    parseProjectsManifest,
    renderProjectsManifest,
    projectManifestRevision,
  });
  return runtime;
}
