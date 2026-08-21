import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import {
  normalizeProjectEnvironmentPreparation,
  parseProjectEnvironmentPreparation,
  projectEnvironmentPreparationScopeSelector,
} from '../../task/domain/project-environment-preparation.mjs';

const ROOT_FIELDS = new Set(['schemaVersion', 'resources', 'capabilities']);
const RESOURCE_FIELDS = new Set(['id', 'title', 'strategy', 'capacity', 'authorization']);
const CAPABILITY_FIELDS = new Set(['id', 'title', 'scope', 'invocation', 'applicability', 'proves', 'requiredForDelivery', 'environment', 'effects', 'resourceClaims']);
const SCOPE_FIELDS = new Set(['project', 'services']);
const INVOCATION_FIELDS = new Set(['kind', 'argv', 'cwd', 'instructions']);
const APPLICABILITY_FIELDS = new Set(['paths', 'conditions']);
const ENVIRONMENT_FIELDS = new Set(['requires', 'preparation']);
const PREPARATION_REFERENCE_FIELDS = new Set(['project', 'service', 'recipe']);
const EFFECTS_FIELDS = new Set(['writes', 'externalSystems', 'authorization']);
const RESOURCE_STRATEGIES = new Set(['coordinated', 'external']);
const AUTHORIZATIONS = new Set(['implicit', 'explicit']);
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unknownFields(value, fields, label, errors) {
  if (!isObject(value)) return;
  for (const field of Object.keys(value)) if (!fields.has(field)) errors.push(`${label}.${field} is not supported.`);
}

function string(value, label, errors, { optional = false } = {}) {
  if (value === undefined && optional) return;
  if (typeof value !== 'string' || !value.trim()) errors.push(`${label} must be a non-empty string.`);
}

function strings(value, label, errors, { minimum = 0 } = {}) {
  if (!Array.isArray(value)) { errors.push(`${label} must be an array.`); return; }
  if (value.length < minimum) errors.push(`${label} must contain at least ${minimum} item${minimum === 1 ? '' : 's'}.`);
  value.forEach((item, index) => string(item, `${label}[${index}]`, errors));
}

function safeRelative(value, label, errors, { glob = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) { errors.push(`${label} must be a non-empty relative ${glob ? 'pattern' : 'path'}.`); return; }
  const normalized = value.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || /^(?:[A-Za-z]:|file:\/\/)/.test(normalized) || normalized.split('/').includes('..')) {
    errors.push(`${label} must stay inside the Project.`);
  }
}

export function parseProjectVerification(content, label = 'verification.yml') {
  try {
    const document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
    if (document.errors.length) throw new Error(document.errors.map((error) => error.message).join('; '));
    return document.toJS({ mapAsMap: false });
  } catch (error) {
    throw new Error(`${label} is invalid YAML: ${error.message}`);
  }
}

export function validateProjectVerification(value, context = {}) {
  const errors = [];
  if (!isObject(value)) return ['verification.yml must be a YAML mapping.'];
  unknownFields(value, ROOT_FIELDS, 'verification', errors);
  if (value.schemaVersion !== 'buildr.project-verification/v2') errors.push('verification.schemaVersion must be buildr.project-verification/v2.');
  if (value.resources !== undefined && !Array.isArray(value.resources)) errors.push('verification.resources must be an array.');
  if (!Array.isArray(value.capabilities)) errors.push('verification.capabilities must be an array.');

  const resourceIds = new Set();
  for (const [index, resource] of (Array.isArray(value.resources) ? value.resources : []).entries()) {
    const label = `verification.resources[${index}]`;
    if (!isObject(resource)) { errors.push(`${label} must be an object.`); continue; }
    unknownFields(resource, RESOURCE_FIELDS, label, errors);
    if (!IDENTITY.test(resource.id || '')) errors.push(`${label}.id is invalid.`);
    else if (resourceIds.has(resource.id)) errors.push(`${label}.id is duplicated: ${resource.id}.`);
    else resourceIds.add(resource.id);
    string(resource.title, `${label}.title`, errors, { optional: true });
    if (!RESOURCE_STRATEGIES.has(resource.strategy)) errors.push(`${label}.strategy must be coordinated or external.`);
    if (resource.strategy === 'coordinated' && (!Number.isInteger(resource.capacity) || resource.capacity < 1)) errors.push(`${label}.capacity must be a positive integer for coordinated resources.`);
    if (resource.strategy === 'external' && resource.capacity !== undefined) errors.push(`${label}.capacity is not supported for external resources.`);
    if (!AUTHORIZATIONS.has(resource.authorization)) errors.push(`${label}.authorization must be implicit or explicit.`);
    if (resource.strategy === 'external' && resource.authorization !== 'explicit') errors.push(`${label}.authorization must be explicit for external resources.`);
  }

  const capabilityIds = new Set();
  const claimedResources = new Set();
  const knownServices = new Set(context.services || []);
  const preparationRecipes = new Map(context.preparationRecipes || []);
  for (const [index, capability] of (Array.isArray(value.capabilities) ? value.capabilities : []).entries()) {
    const label = `verification.capabilities[${index}]`;
    if (!isObject(capability)) { errors.push(`${label} must be an object.`); continue; }
    unknownFields(capability, CAPABILITY_FIELDS, label, errors);
    if (!IDENTITY.test(capability.id || '')) errors.push(`${label}.id is invalid.`);
    else if (capabilityIds.has(capability.id)) errors.push(`${label}.id is duplicated: ${capability.id}.`);
    else capabilityIds.add(capability.id);
    string(capability.title, `${label}.title`, errors, { optional: true });

    if (!isObject(capability.scope)) errors.push(`${label}.scope must be an object.`);
    else {
      unknownFields(capability.scope, SCOPE_FIELDS, `${label}.scope`, errors);
      string(capability.scope.project, `${label}.scope.project`, errors);
      if (context.projectCode && capability.scope.project !== context.projectCode) errors.push(`${label}.scope.project must equal ${context.projectCode}.`);
      strings(capability.scope.services, `${label}.scope.services`, errors);
      for (const service of Array.isArray(capability.scope.services) ? capability.scope.services : []) {
        if (context.services && !knownServices.has(service)) errors.push(`${label}.scope.services references unknown Service ${service}.`);
      }
    }

    if (!isObject(capability.invocation)) errors.push(`${label}.invocation must be an object.`);
    else {
      unknownFields(capability.invocation, INVOCATION_FIELDS, `${label}.invocation`, errors);
      if (!['command', 'agent'].includes(capability.invocation.kind)) errors.push(`${label}.invocation.kind must be command or agent.`);
      if (capability.invocation.kind === 'command') {
        strings(capability.invocation.argv, `${label}.invocation.argv`, errors, { minimum: 1 });
        safeRelative(capability.invocation.cwd ?? '.', `${label}.invocation.cwd`, errors);
        if (capability.invocation.instructions !== undefined) errors.push(`${label}.invocation.instructions is only supported for agent invocation.`);
      }
      if (capability.invocation.kind === 'agent') {
        strings(capability.invocation.instructions, `${label}.invocation.instructions`, errors, { minimum: 1 });
        for (const forbidden of ['argv', 'cwd']) if (capability.invocation[forbidden] !== undefined) errors.push(`${label}.invocation.${forbidden} is only supported for command invocation.`);
      }
    }

    if (!isObject(capability.applicability)) errors.push(`${label}.applicability must be an object.`);
    else {
      unknownFields(capability.applicability, APPLICABILITY_FIELDS, `${label}.applicability`, errors);
      strings(capability.applicability.paths, `${label}.applicability.paths`, errors, { minimum: 1 });
      for (const [pathIndex, pattern] of (Array.isArray(capability.applicability.paths) ? capability.applicability.paths : []).entries()) safeRelative(pattern, `${label}.applicability.paths[${pathIndex}]`, errors, { glob: true });
      if (capability.applicability.conditions !== undefined) strings(capability.applicability.conditions, `${label}.applicability.conditions`, errors);
    }
    strings(capability.proves, `${label}.proves`, errors, { minimum: 1 });
    if (typeof capability.requiredForDelivery !== 'boolean') errors.push(`${label}.requiredForDelivery must be boolean.`);

    if (capability.environment !== undefined) {
      if (!isObject(capability.environment)) errors.push(`${label}.environment must be an object.`);
      else {
        unknownFields(capability.environment, ENVIRONMENT_FIELDS, `${label}.environment`, errors);
        strings(capability.environment.requires, `${label}.environment.requires`, errors);
        if (capability.environment.preparation !== undefined) {
          if (!Array.isArray(capability.environment.preparation)) errors.push(`${label}.environment.preparation must be an array.`);
          const references = Array.isArray(capability.environment.preparation) ? capability.environment.preparation : [];
          const identities = new Set();
          for (const [referenceIndex, reference] of references.entries()) {
            const referenceLabel = `${label}.environment.preparation[${referenceIndex}]`;
            if (!isObject(reference)) { errors.push(`${referenceLabel} must be an object.`); continue; }
            unknownFields(reference, PREPARATION_REFERENCE_FIELDS, referenceLabel, errors);
            string(reference.project, `${referenceLabel}.project`, errors);
            string(reference.recipe, `${referenceLabel}.recipe`, errors);
            string(reference.service, `${referenceLabel}.service`, errors, { optional: true });
            if (context.projectCode && reference.project !== context.projectCode) errors.push(`${referenceLabel}.project must equal ${context.projectCode}.`);
            if (reference.service !== undefined && !knownServices.has(reference.service)) errors.push(`${referenceLabel}.service references unknown Service ${reference.service}.`);
            const recipe = preparationRecipes.get(reference.recipe);
            if (context.preparationRecipes && !recipe) errors.push(`${referenceLabel}.recipe references unknown Preparation Recipe ${reference.recipe}.`);
            if (recipe) {
              const expectedService = recipe.scope?.kind === 'service' ? recipe.scope.service : undefined;
              if (reference.service !== expectedService) errors.push(`${referenceLabel}.service must match Preparation Recipe scope ${projectEnvironmentPreparationScopeSelector(context.projectCode, recipe)}.`);
            }
            const identity = `${reference.project}/${reference.service || ''}/${reference.recipe}`;
            if (identities.has(identity)) errors.push(`${referenceLabel} is duplicated.`);
            identities.add(identity);
          }
        }
      }
    }
    if (capability.effects !== undefined) {
      if (!isObject(capability.effects)) errors.push(`${label}.effects must be an object.`);
      else {
        unknownFields(capability.effects, EFFECTS_FIELDS, `${label}.effects`, errors);
        strings(capability.effects.writes, `${label}.effects.writes`, errors);
        strings(capability.effects.externalSystems, `${label}.effects.externalSystems`, errors);
        if (!AUTHORIZATIONS.has(capability.effects.authorization)) errors.push(`${label}.effects.authorization must be implicit or explicit.`);
        if (Array.isArray(capability.effects.externalSystems) && capability.effects.externalSystems.length > 0 && capability.effects.authorization !== 'explicit') errors.push(`${label}.effects.authorization must be explicit when externalSystems is non-empty.`);
      }
    }
    if (capability.resourceClaims !== undefined) strings(capability.resourceClaims, `${label}.resourceClaims`, errors);
    for (const resource of Array.isArray(capability.resourceClaims) ? capability.resourceClaims : []) {
      claimedResources.add(resource);
      if (!resourceIds.has(resource)) errors.push(`${label}.resourceClaims references unknown resource ${resource}.`);
    }
  }
  for (const resource of resourceIds) if (!claimedResources.has(resource)) errors.push(`verification.resources contains unclaimed resource ${resource}.`);
  return errors;
}

function serviceCodes(projectRoot) {
  const file = path.join(projectRoot, 'services', 'manifest.yml');
  if (!fs.existsSync(file)) return [];
  try {
    const value = YAML.parse(fs.readFileSync(file, 'utf8'));
    return isObject(value?.services) ? Object.keys(value.services) : [];
  } catch {
    return [];
  }
}

function preparationRecipes(projectRoot, projectCode, services) {
  const file = path.join(projectRoot, 'preparation.yml');
  if (!fs.existsSync(file)) return null;
  try {
    const declaration = normalizeProjectEnvironmentPreparation(
      parseProjectEnvironmentPreparation(fs.readFileSync(file, 'utf8'), file),
      { projectCode, services },
    );
    return declaration.recipes.map((recipe) => [recipe.id, recipe]);
  } catch {
    return null;
  }
}

export function createProjectVerificationDiagnostics({ addDoctorFinding }) {
  function diagnoseProjectVerification(result, targetRoot, registry = null) {
    result.projectVerification = [];
    for (const [projectName, project] of Object.entries(registry?.projects || {})) {
      const projectRoot = path.resolve(targetRoot, project.source.path);
      const declarationPath = path.join(projectRoot, 'verification.yml');
      if (!fs.existsSync(declarationPath)) continue;
      const relativePath = path.relative(targetRoot, declarationPath).split(path.sep).join('/');
      let declaration;
      try {
        declaration = parseProjectVerification(fs.readFileSync(declarationPath, 'utf8'), relativePath);
      } catch (error) {
        addDoctorFinding(result, 'error', 'project.verification_invalid', error.message, {
          path: relativePath,
          userActionRequired: true,
          suggestion: '修复 Project verification.yml 并迁移到 buildr.project-verification/v2；在声明有效前不要执行其中的能力。',
        });
        result.projectVerification.push({ project: projectName, path: relativePath, valid: false, capabilityCount: 0 });
        continue;
      }
      const services = serviceCodes(projectRoot);
      const recipes = preparationRecipes(projectRoot, projectName, services);
      const errors = validateProjectVerification(declaration, { projectCode: projectName, services, preparationRecipes: recipes || [] });
      result.projectVerification.push({ project: projectName, path: relativePath, valid: errors.length === 0, capabilityCount: Array.isArray(declaration.capabilities) ? declaration.capabilities.length : 0 });
      for (const message of errors) addDoctorFinding(result, 'error', 'project.verification_invalid', message, {
        path: relativePath,
        userActionRequired: true,
        suggestion: '修复 Project verification.yml 并迁移到 buildr.project-verification/v2；在声明有效前不要执行其中的能力。',
      });
    }
  }
  return { diagnoseProjectVerification };
}
