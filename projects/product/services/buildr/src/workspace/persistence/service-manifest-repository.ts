import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import { createService, isServiceCode } from '../domain/service.ts';
import { resolveSourceRoot } from '../domain/source-root.ts';

export const SERVICES_SCHEMA_V1 = 'buildr.services/v1';
export const SERVICES_SCHEMA_V2 = 'buildr.services/v2';

export type ServiceManifestRepositoryRuntime = {
  assertInitializedBuildrWorkspace(root: string): void;
  atomicWriteFile(file: string, content: string): void;
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

export function registerServiceManifestRepository(runtime: ServiceManifestRepositoryRuntime) {
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
  Object.assign(runtime, { serviceDomainManifestPath, readServiceRegistryPersistence, writeServiceRegistry, parseServicesManifest, renderServicesDomainManifest, serviceManifestRevision });
  return runtime;
}
