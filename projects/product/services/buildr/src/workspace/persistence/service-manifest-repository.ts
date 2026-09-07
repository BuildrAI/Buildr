import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import { createService, isServiceCode } from '../domain/service.ts';
import { resolveSourceRoot } from '../infrastructure/workspace-source-filesystem.ts';

export const SERVICES_SCHEMA_V1 = 'buildr.services/v1';
export const SERVICES_SCHEMA_V2 = 'buildr.services/v2';

export type ServiceManifestRepositoryRuntime = {
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
  for (const key of Object.keys(value)) if (!fields.has(key)) throw new Error(`${label}.${key} is not a supported services/manifest.yml field.`);
}

function parseYaml(content: any, label: any) {
  const document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
  if (document.errors.length) throw new Error(`${label} is invalid YAML: ${document.errors.map((error: any) => error.message).join('; ')}`);
  return plainObject(document.toJS({ mapAsMap: false }), label);
}

function legacyService(code: any, value: any, { workspaceId, projectId, projectCode }: any) {
  const service = plainObject(value, `services.${code}`);
  const repo = plainObject(service.repo, `services.${code}.repo`);
  if (!['workspace', 'git'].includes(repo.kind)) throw new Error(`services.${code}.repo.kind must be workspace or git.`);
  const legacyPath = typeof service.path === 'string' && service.path.trim() ? service.path.trim() : `services/${code}`;
  if (legacyPath !== `services/${code}` && legacyPath !== `projects/${projectCode}/services/${code}`) throw new Error(`services.${code}.path must identify services/${code}.`);
  const source = repo.kind === 'workspace'
    ? { type: 'workspace', path: `projects/${projectCode}/services/${code}` }
    : {
      type: 'git',
      path: `projects/${projectCode}/services/${code}`,
      git: {
        url: typeof repo.url === 'string' ? repo.url.trim() : '',
        remote: typeof repo.remote === 'string' && repo.remote.trim() ? repo.remote.trim() : 'origin',
        integrationBranch: typeof repo.branch === 'string' && repo.branch.trim()
          ? repo.branch.trim()
          : typeof repo.defaultBranch === 'string' ? repo.defaultBranch.trim() : '',
      },
    };
  return {
    id: null,
    workspaceId: workspaceId || null,
    projectId: projectId || null,
    code,
    name: typeof service.title === 'string' && service.title.trim() ? service.title.trim() : code,
    description: typeof service.description === 'string' && service.description.trim() ? service.description.trim() : `TODO: 补充 Service ${projectCode}/${code} 的用途说明。`,
    type: typeof service.type === 'string' && service.type.trim() ? service.type.trim() : 'service',
    source,
  };
}

export function parseServicesManifest(content: any, { workspaceId = null, projectId = null, projectCode, label = 'services/manifest.yml' }: any = {}) {
  if (!isServiceCode(projectCode)) throw new Error('projectCode is required to parse services/manifest.yml.');
  const document = parseYaml(content, label);
  const services = plainObject(document.services, `${label}.services`);
  if (document.schemaVersion === SERVICES_SCHEMA_V2) {
    closedFields(document, new Set(['schemaVersion', 'projectId', 'services']), label);
    if (projectId && document.projectId !== projectId) throw new Error(`${label}.projectId must equal the current Project id.`);
    const canonical = Object.entries(services).sort(([a]: any, [b]: any) => a.localeCompare(b)).map(([key, value]: any) => {
      if (!isServiceCode(key)) throw new Error(`services.${key} key is invalid.`);
      const service = plainObject(value, `services.${key}`);
      closedFields(service, new Set(['id', 'workspaceId', 'projectId', 'code', 'name', 'description', 'type', 'source']), `services.${key}`);
      const source = plainObject(service.source, `services.${key}.source`);
      closedFields(source, new Set(['type', 'root', 'path', 'git']), `services.${key}.source`);
      if (source.git !== undefined) closedFields(plainObject(source.git, `services.${key}.source.git`), new Set(['url', 'remote', 'integrationBranch']), `services.${key}.source.git`);
      const entity = createService({ ...service, projectCode });
      if (entity.code !== key) throw new Error(`services.${key}.code must equal its manifest key.`);
      if (workspaceId && entity.workspaceId !== workspaceId) throw new Error(`services.${key}.workspaceId must equal the current Workspace id.`);
      if (projectId && entity.projectId !== projectId) throw new Error(`services.${key}.projectId must equal the current Project id.`);
      return entity;
    });
    const entities = Object.fromEntries(canonical.map((service: any) => [service.code, service]));
    return { canonical: true, migrationRequired: false, schemaVersion: SERVICES_SCHEMA_V2, projectId: document.projectId, entities, services: entities, document };
  }
  if (document.schemaVersion === SERVICES_SCHEMA_V1) {
    const entities = Object.fromEntries(Object.entries(services).sort(([a]: any, [b]: any) => a.localeCompare(b)).map(([code, value]: any) => {
      if (!isServiceCode(code)) throw new Error(`services.${code} key is invalid.`);
      return [code, legacyService(code, value, { workspaceId, projectId, projectCode })];
    }));
    return { canonical: false, migrationRequired: true, schemaVersion: SERVICES_SCHEMA_V1, projectId, entities, services: entities, document };
  }
  throw new Error(`${label}.schemaVersion must be ${SERVICES_SCHEMA_V1} or ${SERVICES_SCHEMA_V2}.`);
}

export function renderServicesDomainManifest(projectId: any, services: any, projectCode: any = null) {
  const entries = Array.isArray(services) ? services : Object.values(services || {});
  if (typeof projectId !== 'string' || !projectId) throw new Error('Service manifest projectId is required.');
  const canonical = entries.map((service: any) => {
    const match = typeof service?.source?.path === 'string' ? service.source.path.match(/^projects\/([^/]+)\/services\/[^/]+$/) : null;
    return createService({ ...service, projectCode: service.projectCode || projectCode || match?.[1] });
  }).sort((a: any, b: any) => a.code.localeCompare(b.code));
  const document: any = { schemaVersion: SERVICES_SCHEMA_V2, projectId, services: {} };
  for (const service of canonical) {
    document.services[service.code] = {
      id: service.id,
      workspaceId: service.workspaceId,
      projectId: service.projectId,
      code: service.code,
      name: service.name,
      description: service.description,
      type: service.type,
      source: service.source.type === 'workspace' ? { type: 'workspace', path: service.source.path } : { type: 'git', ...((service.source as any).root === 'attached' ? { root: 'attached' } : {}), path: service.source.path, git: { ...(service.source as any).git } },
    };
  }
  return YAML.stringify(document, { lineWidth: 0 });
}

export function serviceManifestRevision(content: any) {
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function parseServicesYaml(content: string) {
  const parsed = parseYaml(content, 'legacy services.yml');
  return parsed.services && typeof parsed.services === 'object' && !Array.isArray(parsed.services) ? parsed.services : parsed;
}

export function parseServicesManifestYaml(content: string) {
  const manifest = parseYaml(content, 'services/manifest.yml');
  if (!manifest.services || typeof manifest.services !== 'object' || Array.isArray(manifest.services)) manifest.services = {};
  return manifest;
}

export function renderServicesManifestYaml(manifest: any, quoteYaml: (value: any) => string = (value) => JSON.stringify(String(value))) {
  if (manifest.schemaVersion === SERVICES_SCHEMA_V2) return renderServicesDomainManifest(manifest.projectId, manifest.services || {});
  const services = manifest.services || {};
  const names = Object.keys(services).sort();
  const lines = [`schemaVersion: ${SERVICES_SCHEMA_V1}`, `project: ${quoteYaml(manifest.project)}`];
  if (!names.length) return `${lines.concat('services: {}').join('\n')}\n`;
  lines.push('services:');
  for (const name of names) {
    const service = services[name];
    lines.push(`  ${name}:`);
    for (const key of ['title', 'description', 'type', 'path']) if (service[key] !== undefined) lines.push(`    ${key}: ${quoteYaml(service[key])}`);
    if (service.repo) {
      lines.push('    repo:');
      for (const key of ['kind', 'url', 'remote', 'defaultBranch', 'branch']) if (service.repo[key] !== undefined) lines.push(`      ${key}: ${quoteYaml(service.repo[key])}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function validateServicesManifest(manifest: any, expectedProject: string) {
  if (manifest?.schemaVersion === SERVICES_SCHEMA_V2) {
    try { parseServicesManifest(YAML.stringify(manifest), { projectCode: expectedProject }); return []; } catch (error: any) { return [error.message]; }
  }
  const errors: string[] = [];
  if (manifest.schemaVersion !== SERVICES_SCHEMA_V1) errors.push(`services/manifest.yml schemaVersion must be ${SERVICES_SCHEMA_V1}.`);
  if (manifest.project !== expectedProject) errors.push(`services/manifest.yml project must be ${expectedProject}.`);
  if (!manifest.services || typeof manifest.services !== 'object' || Array.isArray(manifest.services)) return [...errors, 'services/manifest.yml services must be an object.'];
  for (const [serviceName, raw] of Object.entries(manifest.services as Record<string, any>)) {
    const label = `services.${serviceName}`;
    if (!isServiceCode(serviceName)) errors.push(`${label} key must contain only letters, digits, dots, underscores, or dashes.`);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(`${label} must be an object.`); continue; }
    const service = raw as Record<string, any>;
    for (const key of Object.keys(service)) if (!new Set(['title', 'description', 'type', 'path', 'repo']).has(key)) errors.push(`${label}.${key} is not a supported services/manifest.yml field.`);
    if (!service.title || typeof service.title !== 'string') errors.push(`${label}.title is required.`);
    if (!service.description || typeof service.description !== 'string') errors.push(`${label}.description is required.`);
    if (!service.type || typeof service.type !== 'string') errors.push(`${label}.type is required.`);
    if (service.path !== `services/${serviceName}`) errors.push(`${label}.path must be services/${serviceName}.`);
    if (!service.repo || typeof service.repo !== 'object' || Array.isArray(service.repo)) { errors.push(`${label}.repo is required.`); continue; }
    for (const key of Object.keys(service.repo)) if (!new Set(['kind', 'url', 'remote', 'defaultBranch', 'branch']).has(key)) errors.push(`${label}.repo.${key} is not a supported repo field.`);
    if (!['workspace', 'git'].includes(service.repo.kind)) errors.push(`${label}.repo.kind must be workspace or git.`);
    if (service.repo.kind === 'workspace') for (const key of ['url', 'remote', 'defaultBranch', 'branch']) if (service.repo[key] !== undefined) errors.push(`${label}.repo.${key} is only supported for git-managed Services.`);
    if (service.repo.kind === 'git') {
      if (service.repo.url !== undefined && typeof service.repo.url !== 'string') errors.push(`${label}.repo.url must be a string when provided.`);
      if (service.repo.remote !== undefined && typeof service.repo.remote !== 'string') errors.push(`${label}.repo.remote must be a string when provided.`);
      if (service.repo.defaultBranch !== undefined && typeof service.repo.defaultBranch !== 'string') errors.push(`${label}.repo.defaultBranch must be a string when provided.`);
      if (service.repo.branch !== undefined && (typeof service.repo.branch !== 'string' || !service.repo.branch)) errors.push(`${label}.repo.branch must be a non-empty string when provided.`);
    }
  }
  return errors;
}

export function createServiceManifestRepository(runtime: ServiceManifestRepositoryRuntime) {
  function serviceDomainManifestPath(targetRoot: any, project: any) {
    const projectRoot = typeof project === 'string'
      ? path.join(path.resolve(targetRoot), 'projects', project)
      : resolveSourceRoot(path.resolve(targetRoot), project.source);
    return path.join(projectRoot, 'services', 'manifest.yml');
  }
  function readServiceRegistryPersistence(targetRoot: any, project: any, workspaceId: any) {
    const root = path.resolve(targetRoot);
    runtime.assertInitializedBuildrWorkspace(root);
    const manifestPath = serviceDomainManifestPath(root, project);
    const content = fs.readFileSync(manifestPath, 'utf8');
    return { root, manifestPath, content, revision: serviceManifestRevision(content), registry: parseServicesManifest(content, { workspaceId, projectId: project.id, projectCode: project.code }) };
  }
  function writeServiceRegistry(file: any, projectId: any, services: any, projectCode: any = path.basename(path.dirname(path.dirname(file)))) {
    runtime.atomicWriteFile(file, renderServicesDomainManifest(projectId, services, projectCode));
  }

  function servicesManifestPath(projectRoot: string) {
    return path.join(projectRoot, 'services', 'manifest.yml');
  }

  function readServicesManifestForWrite(projectRoot: string, projectName: string) {
    const file = servicesManifestPath(projectRoot);
    if (!runtime.existsFile(file)) return { schemaVersion: SERVICES_SCHEMA_V1, project: projectName, services: {} };
    const manifest = parseServicesManifestYaml(fs.readFileSync(file, 'utf8'));
    const errors = validateServicesManifest(manifest, projectName)
      .filter((message) => !message.endsWith('.title is required.'))
      .filter((message) => !message.endsWith('.description is required.'))
      .filter((message) => !message.endsWith('.type is required.'));
    if (errors.length) throw new Error(`services/manifest.yml is invalid:\n- ${errors.join('\n- ')}`);
    return manifest;
  }

  function writeServicesManifest(projectRoot: string, manifest: any) {
    const file = servicesManifestPath(projectRoot);
    runtime.atomicWriteFile(file, renderServicesManifestYaml(manifest, runtime.quoteYaml));
    return file;
  }

  function updateServicesManifest(projectRoot: string, projectName: string, serviceName: string, metadata: any) {
    const manifest = readServicesManifestForWrite(projectRoot, projectName);
    manifest.schemaVersion = SERVICES_SCHEMA_V1;
    manifest.project = projectName;
    manifest.services[serviceName] = metadata;
    return writeServicesManifest(projectRoot, manifest);
  }

  return Object.freeze({
    serviceDomainManifestPath, readServiceRegistryPersistence, writeServiceRegistry,
    parseServicesManifest, renderServicesDomainManifest, serviceManifestRevision,
    validateServiceRegistryFile: (file: string, options: any) => parseServicesManifest(fs.readFileSync(file, 'utf8'), options),
    parseServicesYaml, parseServicesManifestYaml,
    renderServicesManifestYaml: (manifest: any) => renderServicesManifestYaml(manifest, runtime.quoteYaml),
    validateServicesManifest, servicesManifestPath, readServicesManifestForWrite, writeServicesManifest, updateServicesManifest,
  });
}

export type ServiceRepository = ReturnType<typeof createServiceManifestRepository>;
