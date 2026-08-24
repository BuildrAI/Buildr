import crypto from 'node:crypto';
import YAML from 'yaml';

import { normalizePreparationStepDefinition, taskEnvironmentPlanDigest } from './task-environment-plan.mjs';

export const PROJECT_ENVIRONMENT_PREPARATION_SCHEMA = 'buildr.project-environment-preparation/v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function failure(message, details = undefined) {
  const error = new Error(message);
  error.code = 'project_environment_preparation_invalid';
  error.status = 409;
  error.details = details;
  error.taskEnvironmentBusiness = true;
  return error;
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure(`${field} 必须是对象。`, { field });
  return value;
}

function closed(value, fields, field) {
  for (const key of Object.keys(value)) if (!fields.has(key)) throw failure(`${field}.${key} 不受支持。`, { field: `${field}.${key}` });
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw failure(`${field} 必须是非空字符串。`, { field });
  return value.trim();
}

function id(value, field) {
  const result = text(value, field);
  if (!ID.test(result)) throw failure(`${field} 不是合法identity。`, { field, value });
  return result;
}

export function parseProjectEnvironmentPreparation(content, label = 'preparation.yml') {
  try {
    const document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
    if (document.errors.length) throw new Error(document.errors.map((error) => error.message).join('; '));
    return document.toJS({ mapAsMap: false });
  } catch (error) {
    throw failure(`${label} is invalid YAML: ${error.message}`);
  }
}

export function normalizeProjectEnvironmentPreparation(value, { projectCode, services = [] } = {}) {
  const declaration = object(value, 'preparation');
  closed(declaration, new Set(['schemaVersion', 'recipes']), 'preparation');
  if (declaration.schemaVersion !== PROJECT_ENVIRONMENT_PREPARATION_SCHEMA) throw failure(`preparation.schemaVersion 必须是 ${PROJECT_ENVIRONMENT_PREPARATION_SCHEMA}。`);
  if (!Array.isArray(declaration.recipes)) throw failure('preparation.recipes 必须是数组。');
  const knownServices = new Set(services);
  const recipes = declaration.recipes.map((value, index) => {
    const field = `preparation.recipes[${index}]`;
    const recipe = object(value, field);
    closed(recipe, new Set(['id', 'title', 'scope', 'required', 'steps']), field);
    const scope = object(recipe.scope, `${field}.scope`);
    closed(scope, new Set(['kind', 'service']), `${field}.scope`);
    if (!['project', 'service'].includes(scope.kind)) throw failure(`${field}.scope.kind 必须是project或service。`);
    const service = scope.kind === 'service' ? id(scope.service, `${field}.scope.service`) : null;
    if (scope.kind === 'project' && scope.service !== undefined) throw failure(`${field}.scope.service 只适用于service scope。`);
    if (service && !knownServices.has(service)) throw failure(`${field}.scope.service引用未知Service：${service}。`, { service });
    if (typeof recipe.required !== 'boolean') throw failure(`${field}.required 必须是boolean。`);
    if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) throw failure(`${field}.steps 必须是非空数组。`);
    const steps = recipe.steps.map((step, stepIndex) => normalizePreparationStepDefinition(step, field, stepIndex));
    if (new Set(steps.map((step) => step.id)).size !== steps.length) throw failure(`${field}.steps id不能重复。`);
    if (scope.kind === 'project' && steps.some((step) => step.executable.kind === 'service')) throw failure(`${field} Project Recipe不能使用service executable。`);
    const payload = { id: id(recipe.id, `${field}.id`), title: recipe.title === undefined || recipe.title === null ? null : text(recipe.title, `${field}.title`), scope: { kind: scope.kind, service }, required: recipe.required, steps };
    return { ...payload, identity: taskEnvironmentPlanDigest({ project: projectCode, ...payload }) };
  });
  if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length) throw failure('preparation.recipes id不能重复。');
  const payload = { schemaVersion: PROJECT_ENVIRONMENT_PREPARATION_SCHEMA, project: projectCode, recipes };
  return { ...payload, identity: `sha256-${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}` };
}

export function projectEnvironmentPreparationScopeSelector(project, recipe) {
  return recipe.scope.kind === 'project' ? `project:${project}` : `service:${project}/${recipe.scope.service}`;
}
