import path from 'node:path';

import { taskEnvironmentError } from './task-environment.mjs';

export const PROJECT_TASK_ENVIRONMENT_SCHEMA = 'buildr.project-task-environment/v1';

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw taskEnvironmentError('task_environment_declaration_invalid', `${field} 必须是对象。`, 409, { field });
  return value;
}

function closed(value, fields, field) {
  for (const key of Object.keys(value)) if (!fields.has(key)) throw taskEnvironmentError('task_environment_declaration_field_forbidden', `Task Environment dependency declaration 不支持字段：${field}.${key}。`, 409, { field: `${field}.${key}` });
}

function identity(value, field) {
  if (typeof value !== 'string' || !IDENTITY.test(value)) throw taskEnvironmentError('task_environment_declaration_invalid', `${field} 不是合法 identity。`, 409, { field, value });
  return value;
}

function relative(value, field, { dot = false } = {}) {
  if (typeof value !== 'string' || (!value && !dot)) throw taskEnvironmentError('task_environment_declaration_invalid', `${field} 必须是相对路径。`, 409, { field });
  const normalized = value.replaceAll('\\', '/');
  if ((normalized === '.' && dot) || (normalized && !path.posix.isAbsolute(normalized) && path.posix.normalize(normalized) === normalized && !normalized.startsWith('../'))) return normalized;
  throw taskEnvironmentError('task_environment_declaration_path_invalid', `${field} 必须是规范化 Service 相对路径。`, 409, { field, value });
}

export function parseProjectTaskEnvironmentDeclaration(value, { project, knownServices }) {
  const declaration = object(value, 'task-environment.yml');
  closed(declaration, new Set(['schemaVersion', 'services']), 'task-environment.yml');
  if (declaration.schemaVersion !== PROJECT_TASK_ENVIRONMENT_SCHEMA) throw taskEnvironmentError('task_environment_declaration_schema_unsupported', `task-environment.yml schemaVersion 必须是 ${PROJECT_TASK_ENVIRONMENT_SCHEMA}。`, 409, { project, actual: declaration.schemaVersion });
  const services = object(declaration.services, 'task-environment.yml.services');
  const known = new Set(knownServices);
  const parsed = {};
  for (const [serviceCode, input] of Object.entries(services)) {
    identity(serviceCode, `services.${serviceCode}`);
    if (!known.has(serviceCode)) throw taskEnvironmentError('task_environment_declaration_service_unknown', `Task Environment dependency declaration 引用了未知 Service：${project}/${serviceCode}。`, 409, { project, service: serviceCode });
    const service = object(input, `services.${serviceCode}`);
    closed(service, new Set(['dependencyRoots', 'requires']), `services.${serviceCode}`);
    if (!Array.isArray(service.dependencyRoots) || !Array.isArray(service.requires)) throw taskEnvironmentError('task_environment_declaration_invalid', `services.${serviceCode} 的 dependencyRoots/requires 必须是数组。`, 409, { project, service: serviceCode });
    const rootIds = new Set();
    const dependencyRoots = service.dependencyRoots.map((rootInput, index) => {
      const field = `services.${serviceCode}.dependencyRoots[${index}]`;
      const root = object(rootInput, field);
      closed(root, new Set(['id', 'manager', 'root', 'manifest', 'lockfile', 'required']), field);
      const id = identity(root.id, `${field}.id`);
      if (rootIds.has(id)) throw taskEnvironmentError('task_environment_declaration_root_duplicate', `Dependency root id 重复：${project}/${serviceCode}/${id}。`, 409, { project, service: serviceCode, id });
      rootIds.add(id);
      if (root.manager !== 'npm') throw taskEnvironmentError('task_environment_dependency_manager_unsupported', `依赖根 package manager 不受支持：${root.manager}。`, 409, { project, service: serviceCode, manager: root.manager });
      if (typeof root.required !== 'boolean') throw taskEnvironmentError('task_environment_declaration_invalid', `${field}.required 必须是 boolean。`, 409, { field: `${field}.required` });
      return { id, manager: root.manager, root: relative(root.root, `${field}.root`, { dot: true }), manifest: relative(root.manifest, `${field}.manifest`), lockfile: relative(root.lockfile, `${field}.lockfile`), required: root.required };
    });
    const requires = service.requires.map((requireInput, index) => {
      const field = `services.${serviceCode}.requires[${index}]`;
      const requirement = object(requireInput, field);
      closed(requirement, new Set(['service', 'purpose']), field);
      const requiredService = identity(requirement.service, `${field}.service`);
      if (!known.has(requiredService)) throw taskEnvironmentError('task_environment_declaration_service_unknown', `Task Environment dependency declaration 引用了未知 Service：${project}/${requiredService}。`, 409, { project, service: requiredService });
      if (typeof requirement.purpose !== 'string' || !requirement.purpose.trim()) throw taskEnvironmentError('task_environment_declaration_invalid', `${field}.purpose 必须是非空字符串。`, 409, { field: `${field}.purpose` });
      return { service: requiredService, purpose: requirement.purpose.trim() };
    });
    parsed[serviceCode] = { dependencyRoots, requires };
  }
  return { schemaVersion: PROJECT_TASK_ENVIRONMENT_SCHEMA, services: parsed };
}

export function projectServiceDependencyClosure(declaration, entryServices) {
  const closure = new Map();
  const visit = (service, requiredBy, stack) => {
    if (stack.includes(service)) throw taskEnvironmentError('task_environment_dependency_cycle', `Task Environment Service dependency 存在循环：${[...stack, service].join(' -> ')}。`, 409, { cycle: [...stack, service] });
    if (!closure.has(service)) closure.set(service, new Set());
    closure.get(service).add(requiredBy);
    const declared = declaration.services[service];
    if (!declared) return;
    for (const requirement of declared.requires) visit(requirement.service, requiredBy, [...stack, service]);
  };
  for (const service of entryServices) visit(service, service, []);
  return closure;
}
