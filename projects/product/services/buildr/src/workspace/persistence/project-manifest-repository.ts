import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import { createProject, isProjectCode } from '../domain/project.ts';

export const PROJECTS_SCHEMA_V1 = 'buildr.projects/v1';
export const PROJECTS_SCHEMA_V2 = 'buildr.projects/v2';

export type ProjectManifestRepositoryRuntime = {
  assertInitializedBuildrWorkspace(root: string): void;
  atomicWriteFile(file: string, content: string): void;
  existsFile(file: string): boolean;
  quoteYaml(value: any): string;
};

function plainObject(value: any, label: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function closedFields(value: any, fields: any, label: any) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw new Error(`${label}.${key} is not a supported projects/manifest.yml field.`);
  }
}

function parseYaml(content: any, label: any) {
  const document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
  if (document.errors.length) throw new Error(`${label} is invalid YAML: ${document.errors.map((error: any) => error.message).join('; ')}`);
  return plainObject(document.toJS({ mapAsMap: false }), label);
}

function legacyProject(code: any, value: any, workspaceId: any) {
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

export function parseProjectsManifest(content: any, { workspaceId = null, label = 'projects/manifest.yml' }: any = {}) {
  const document = parseYaml(content, label);
  const projects = plainObject(document.projects, `${label}.projects`);
  if (document.schemaVersion === PROJECTS_SCHEMA_V2) {
    closedFields(document, new Set(['schemaVersion', 'projects']), label);
    const canonical = Object.entries(projects).sort(([a]: any, [b]: any) => a.localeCompare(b)).map(([key, value]: any) => {
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
    const entities = Object.fromEntries(canonical.map((project: any) => [project.code, project]));
    return { canonical: true, migrationRequired: false, schemaVersion: PROJECTS_SCHEMA_V2, projects: entities, entities, document };
  }
  if (document.schemaVersion === PROJECTS_SCHEMA_V1) {
    const entities = Object.fromEntries(Object.entries(projects).sort(([a]: any, [b]: any) => a.localeCompare(b)).map(([code, value]: any) => {
      if (!isProjectCode(code)) throw new Error(`projects.${code} key is invalid.`);
      return [code, legacyProject(code, value, workspaceId)];
    }));
    return { canonical: false, migrationRequired: true, schemaVersion: PROJECTS_SCHEMA_V1, projects: entities, entities, document };
  }
  throw new Error(`${label}.schemaVersion must be ${PROJECTS_SCHEMA_V1} or ${PROJECTS_SCHEMA_V2}.`);
}

export function renderProjectsManifest(projects: any) {
  const entries = Array.isArray(projects) ? projects : Object.values(projects || {});
  const canonical = entries.map((project: any) => createProject(project)).sort((a: any, b: any) => a.code.localeCompare(b.code));
  const document: any = { schemaVersion: PROJECTS_SCHEMA_V2, projects: {} };
  for (const project of canonical) {
    document.projects[project.code] = {
      id: project.id,
      workspaceId: project.workspaceId,
      code: project.code,
      name: project.name,
      description: project.description,
      source: project.source.type === 'workspace'
        ? { type: 'workspace', path: project.source.path }
        : { type: 'git', ...((project.source as any).root === 'attached' ? { root: 'attached' } : {}), path: project.source.path, git: { ...(project.source as any).git } },
    };
  }
  return YAML.stringify(document, { lineWidth: 0 });
}

export function projectManifestRevision(content: any) {
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function parseProjectsYaml(content: string) {
  const registry = parseYaml(content, 'projects/manifest.yml');
  if (!registry.projects || typeof registry.projects !== 'object' || Array.isArray(registry.projects)) registry.projects = {};
  return registry;
}

export function renderProjectsYaml(registry: any, quoteYaml: (value: any) => string = (value) => JSON.stringify(String(value))) {
  if (registry.schemaVersion === PROJECTS_SCHEMA_V2) return renderProjectsManifest(registry.projects || {});
  const projects = registry.projects || {};
  const names = Object.keys(projects).sort();
  const lines = [PROJECTS_SCHEMA_V1];
  lines[0] = `schemaVersion: ${PROJECTS_SCHEMA_V1}`;
  if (!names.length) return `${lines.concat('projects: {}').join('\n')}\n`;
  lines.push('projects:');
  for (const name of names) {
    const project = projects[name];
    lines.push(`  ${name}:`);
    for (const key of ['title', 'description', 'path']) if (project[key] !== undefined) lines.push(`    ${key}: ${quoteYaml(project[key])}`);
    if (project.repo) {
      lines.push('    repo:');
      for (const key of ['kind', 'url', 'remote', 'defaultBranch']) if (project.repo[key] !== undefined) lines.push(`      ${key}: ${quoteYaml(project.repo[key])}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function validateProjectsRegistry(registry: any) {
  if (registry?.schemaVersion === PROJECTS_SCHEMA_V2) {
    try { parseProjectsManifest(YAML.stringify(registry)); return []; } catch (error: any) { return [error.message]; }
  }
  const errors: string[] = [];
  if (String(registry.schemaVersion) !== PROJECTS_SCHEMA_V1) errors.push(`projects/manifest.yml schemaVersion must be ${PROJECTS_SCHEMA_V1}.`);
  if (!registry.projects || typeof registry.projects !== 'object' || Array.isArray(registry.projects)) return [...errors, 'projects/manifest.yml projects must be an object.'];
  for (const [projectName, raw] of Object.entries(registry.projects as Record<string, any>)) {
    const label = `projects.${projectName}`;
    if (!isProjectCode(projectName)) errors.push(`${label} key must contain only letters, digits, dots, underscores, or dashes.`);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(`${label} must be an object.`); continue; }
    const project = raw as Record<string, any>;
    for (const key of Object.keys(project)) if (!new Set(['title', 'description', 'path', 'repo']).has(key)) errors.push(`${label}.${key} is not a supported projects/manifest.yml field.`);
    if (!project.title || typeof project.title !== 'string') errors.push(`${label}.title is required.`);
    if (!project.description || typeof project.description !== 'string') errors.push(`${label}.description is required.`);
    if (project.path !== `projects/${projectName}`) errors.push(`${label}.path must be projects/${projectName}.`);
    if (!project.repo || typeof project.repo !== 'object' || Array.isArray(project.repo)) { errors.push(`${label}.repo is required.`); continue; }
    for (const key of Object.keys(project.repo)) if (!new Set(['kind', 'url', 'remote', 'defaultBranch']).has(key)) errors.push(`${label}.repo.${key} is not a supported repo field.`);
    if (!['workspace', 'git'].includes(project.repo.kind)) errors.push(`${label}.repo.kind must be workspace or git.`);
    if (project.repo.kind === 'workspace') for (const key of ['url', 'remote', 'defaultBranch']) if (project.repo[key] !== undefined) errors.push(`${label}.repo.${key} is only supported for git-managed Projects.`);
    if (project.repo.kind === 'git') {
      if (project.repo.url !== undefined && typeof project.repo.url !== 'string') errors.push(`${label}.repo.url must be a string when provided.`);
      if (project.repo.remote !== undefined && typeof project.repo.remote !== 'string') errors.push(`${label}.repo.remote must be a string when provided.`);
      if (project.repo.defaultBranch !== undefined && typeof project.repo.defaultBranch !== 'string') errors.push(`${label}.repo.defaultBranch must be a string when provided.`);
    }
  }
  return errors;
}

export function registerProjectManifestRepository(runtime: ProjectManifestRepositoryRuntime) {
  function projectsManifestPath(targetRoot: any) {
    return path.join(path.resolve(targetRoot), 'projects', 'manifest.yml');
  }

  function readProjectRegistryPersistence(targetRoot: any, options: any = {}) {
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

  function writeProjectRegistry(file: any, projects: any) {
    runtime.atomicWriteFile(file, renderProjectsManifest(projects));
  }

  function readProjectsRegistryForWrite(targetRoot: string) {
    const file = projectsManifestPath(targetRoot);
    if (!runtime.existsFile(file)) return { schemaVersion: PROJECTS_SCHEMA_V1, projects: {} };
    const registry = parseProjectsYaml(fs.readFileSync(file, 'utf8'));
    const errors = validateProjectsRegistry(registry).filter((message) => !message.endsWith('.title is required.')).filter((message) => !message.endsWith('.description is required.'));
    if (errors.length) throw new Error(`projects/manifest.yml is invalid:\n- ${errors.join('\n- ')}`);
    return registry;
  }

  function writeProjectsRegistry(targetRoot: string, registry: any) {
    const file = projectsManifestPath(targetRoot);
    runtime.atomicWriteFile(file, renderProjectsYaml(registry, runtime.quoteYaml));
    return file;
  }

  Object.assign(runtime, {
    projectsManifestPath,
    readProjectRegistryPersistence,
    writeProjectRegistry,
    parseProjectsManifest,
    renderProjectsManifest,
    projectManifestRevision,
    parseProjectsYaml,
    renderProjectsYaml: (registry: any) => renderProjectsYaml(registry, runtime.quoteYaml),
    validateProjectsRegistry,
    readProjectsRegistryForWrite,
    writeProjectsRegistry,
  });
  return runtime;
}
