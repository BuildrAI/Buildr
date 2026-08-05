import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import YAML from 'yaml';

export const TASK_FINISH_ACTIVATION_SCHEMA = 'buildr.task-finish-activation/v1';
export const TASK_FINISH_ACTIVATION_MODES = Object.freeze(['sync-workspace']);

const ROOT_RUNTIME_SOURCE = /^(?:AGENTS\.md$|rules\/|skills\/|components\/|commands\/|capabilities\.yml$|commands\.yml$)/;
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function activationError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function portable(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function closed(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw activationError('task-finish.activation-declaration-invalid', `${label} must be a mapping.`);
  const unknown = Object.keys(value).filter((key) => !fields.has(key));
  if (unknown.length) throw activationError('task-finish.activation-declaration-invalid', `${label} contains unknown fields: ${unknown.join(', ')}`);
}

function inputPattern(value, label) {
  const normalized = portable(value);
  if (!normalized || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw activationError('task-finish.activation-input-outside-project', `${label} must stay inside its Project root: ${value}`);
  }
  if (normalized.includes('*') && !normalized.endsWith('/**')) {
    throw activationError('task-finish.activation-declaration-invalid', `${label} only supports an exact path or a trailing /** pattern: ${value}`);
  }
  if (normalized.slice(0, -3).includes('*')) throw activationError('task-finish.activation-declaration-invalid', `${label} contains an unsupported wildcard: ${value}`);
  return normalized;
}

export function parseTaskFinishActivationDeclaration(content, { label = 'task-finish.yml' } = {}) {
  let document;
  try {
    document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
  } catch (error) {
    throw activationError('task-finish.activation-declaration-invalid', `${label} is invalid YAML: ${error.message}`);
  }
  if (document.errors.length) throw activationError('task-finish.activation-declaration-invalid', `${label} is invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
  const value = document.toJS();
  closed(value, new Set(['schemaVersion', 'bindings']), label);
  if (value.schemaVersion !== TASK_FINISH_ACTIVATION_SCHEMA) throw activationError('task-finish.activation-declaration-invalid', `${label}.schemaVersion must be ${TASK_FINISH_ACTIVATION_SCHEMA}.`);
  if (!Array.isArray(value.bindings)) throw activationError('task-finish.activation-declaration-invalid', `${label}.bindings must be an array.`);
  const ids = new Set();
  const bindings = value.bindings.map((binding, index) => {
    const bindingLabel = `${label}.bindings[${index}]`;
    closed(binding, new Set(['id', 'service', 'mode', 'inputs']), bindingLabel);
    if (!ID_PATTERN.test(String(binding.id || '')) || ids.has(binding.id)) throw activationError('task-finish.activation-declaration-invalid', `${bindingLabel}.id must be unique and portable.`);
    ids.add(binding.id);
    if (!ID_PATTERN.test(String(binding.service || ''))) throw activationError('task-finish.activation-declaration-invalid', `${bindingLabel}.service is invalid.`);
    if (!TASK_FINISH_ACTIVATION_MODES.includes(binding.mode)) throw activationError('task-finish.activation-declaration-invalid', `${bindingLabel}.mode is unsupported: ${binding.mode}`);
    if (!Array.isArray(binding.inputs) || binding.inputs.length === 0) throw activationError('task-finish.activation-declaration-invalid', `${bindingLabel}.inputs must be a non-empty array.`);
    const inputs = [...new Set(binding.inputs.map((input, inputIndex) => inputPattern(input, `${bindingLabel}.inputs[${inputIndex}]`)))].sort();
    return { id: binding.id, service: binding.service, mode: binding.mode, inputs };
  });
  const declaration = { schemaVersion: TASK_FINISH_ACTIVATION_SCHEMA, bindings };
  return { declaration, digest: digest(declaration) };
}

export function readRetainedTaskFinishActivation({ workspaceRoot, project }) {
  const file = path.join(path.resolve(workspaceRoot), 'projects', project, 'task-finish.yml');
  if (!fs.existsSync(file)) return { file, present: false, declaration: null, digest: null };
  const parsed = parseTaskFinishActivationDeclaration(fs.readFileSync(file, 'utf8'), { label: `projects/${project}/task-finish.yml` });
  return { file, present: true, ...parsed };
}

function matchesInput(relativePath, input) {
  if (!input.endsWith('/**')) return relativePath === input;
  const prefix = input.slice(0, -3).replace(/\/$/, '');
  return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
}

function finishPlan(value) {
  const identity = digest({ schemaVersion: 'buildr.task-finish-activation-plan/v1', ...value });
  return { schemaVersion: 'buildr.task-finish-activation-plan/v1', ...value, identity };
}

export function planRetainedTaskFinishActivation({ workspaceRoot, agent, task, changedPaths = [] }) {
  const normalizedPaths = [...new Set(changedPaths.map(portable).filter(Boolean))].sort();
  const scope = task?.scope || { projects: [], services: [] };
  const services = Array.isArray(scope.services) ? scope.services : [];
  const candidates = [];

  for (const serviceScope of services) {
    const project = serviceScope?.project;
    const service = serviceScope?.service;
    if (!project || !service) continue;
    const retained = readRetainedTaskFinishActivation({ workspaceRoot, project });
    if (!retained.present) continue;
    const projectPrefix = `projects/${project}/`;
    const projectPaths = normalizedPaths.filter((item) => item.startsWith(projectPrefix)).map((item) => ({ repositoryPath: item, projectPath: item.slice(projectPrefix.length) }));
    for (const binding of retained.declaration.bindings.filter((item) => item.service === service)) {
      const matchedPaths = projectPaths.filter(({ projectPath }) => binding.inputs.some((input) => matchesInput(projectPath, input))).map(({ repositoryPath }) => repositoryPath);
      if (matchedPaths.length) candidates.push({ project, service, binding, matchedPaths, declarationDigest: retained.digest });
    }
  }

  if (candidates.length > 1) throw activationError('task-finish.activation-binding-ambiguous', 'Task Contribution matches more than one retained Task Finish activation binding.', candidates.map((item) => ({ project: item.project, service: item.service, binding: item.binding.id, matchedPaths: item.matchedPaths })));
  if (candidates.length === 1) {
    const selected = candidates[0];
    return finishPlan({ mode: 'sync-workspace', agent, project: selected.project, service: selected.service, bindingIdentity: digest({ project: selected.project, declarationDigest: selected.declarationDigest, binding: selected.binding }), declarationDigest: selected.declarationDigest, matchedPaths: selected.matchedPaths, gitEffect: 'managed-only' });
  }

  const runtimePaths = normalizedPaths.filter((item) => !item.startsWith('projects/') && ROOT_RUNTIME_SOURCE.test(item));
  if (runtimePaths.length) return finishPlan({ mode: 'render-runtime', agent, project: null, service: null, bindingIdentity: null, declarationDigest: null, matchedPaths: runtimePaths, gitEffect: 'forbidden' });
  return finishPlan({ mode: 'none', agent, project: null, service: null, bindingIdentity: null, declarationDigest: null, matchedPaths: [], gitEffect: 'forbidden' });
}
