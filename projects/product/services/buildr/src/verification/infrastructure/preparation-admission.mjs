import crypto from 'node:crypto';
import { VERIFICATION_COMMAND_TIMEOUT_DEFAULT_MS } from '../domain/verification-deadline.mjs';

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function verificationCapabilityIdentity(capability) {
  const canonicalInvocation = (value) => value?.kind === 'command'
    ? { ...value, timeoutMs: value.timeoutMs ?? VERIFICATION_COMMAND_TIMEOUT_DEFAULT_MS }
    : value;
  const invocation = capability.invocation && typeof capability.invocation === 'object'
    ? Object.fromEntries(Object.entries(capability.invocation).map(([key, value]) => [key, canonicalInvocation(value)]))
    : capability.invocation;
  return digest({
    id: capability.id,
    scope: capability.scope,
    invocation,
    environment: capability.environment || null,
    effects: capability.effects || null,
    resourceClaims: capability.resourceClaims || [],
  });
}

function recoveryRequest(context, requirements) {
  const projects = (context.preparationPlan?.projects || []).map((project) => ({
    project: project.project,
    source: { kind: project.source.kind, ...(project.source.identity ? { identity: project.source.identity } : {}) },
    scopes: project.scopes.map((scope) => ({
      selector: scope.selector,
      disposition: scope.disposition,
      reason: scope.reason,
      ...(scope.disposition === 'required' ? { recipeIds: scope.recipes.map((recipe) => recipe.id) } : {}),
    })),
  }));
  const auxiliaryPreparation = requirements.map((requirement) => ({
    capability: requirement.capability,
    capabilityIdentity: requirement.capabilityIdentity,
    project: requirement.project,
    selector: requirement.selector,
    recipe: requirement.recipe,
  }));
  return {
    schemaVersion: 'buildr.task-environment-plan-request/v1',
    projects,
    auxiliaryPreparation,
  };
}

export function verificationPreparationAdmission({ projectCode, declarationIdentity, selectedCapabilities, context }) {
  const selected = selectedCapabilities.map((capability) => ({ id: capability.id, identity: verificationCapabilityIdentity(capability) })).sort((left, right) => left.id.localeCompare(right.id));
  const capabilityById = new Map(selected.map((item) => [item.id, item]));
  const requirements = [];
  for (const capability of selectedCapabilities) {
    for (const reference of capability.environment?.preparation || []) {
      requirements.push({
        capability: capability.id,
        capabilityIdentity: capabilityById.get(capability.id).identity,
        project: reference.project,
        selector: reference.service ? `service:${reference.project}/${reference.service}` : `project:${reference.project}`,
        recipe: reference.recipe,
      });
    }
  }
  requirements.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const uniqueRequirements = [...new Map(requirements.map((item) => [`${item.capabilityIdentity}/${item.project}/${item.selector}/${item.recipe}`, item])).values()];
  const closureIdentity = digest({ projectCode, declarationIdentity, selected, requirements: uniqueRequirements });
  const runtimeInvocationIdentity = context?.runtimeInvocation ? digest(context.runtimeInvocation) : null;
  const binding = {
    selected,
    declarationIdentity,
    closureIdentity,
    planIdentity: context?.preparationPlan?.identity || null,
    receiptIdentity: context?.receiptIdentity || null,
    runtimeInvocationIdentity,
  };
  if (!context) return { status: 'ready', identity: digest(binding), binding, requirements: uniqueRequirements, gaps: [], recovery: null };

  const currentRecipes = new Map((context.preparationRecipes || []).map((recipe) => [`${recipe.scope}/${recipe.recipe}`, recipe]));
  const plannedRequirements = new Set((context.preparationPlan?.capabilityPreparation || []).map((item) => `${item.capabilityIdentity}/${item.selector}/${item.recipe.id}`));
  const gaps = [];
  const recoverable = [];
  for (const requirement of uniqueRequirements) {
    const current = currentRecipes.get(`${requirement.selector}/${requirement.recipe}`);
    const planned = plannedRequirements.has(`${requirement.capabilityIdentity}/${requirement.selector}/${requirement.recipe}`);
    if (!planned || !current || current.status !== 'ready' || current.identity !== current.preparedIdentity) {
      gaps.push({
        category: 'preparation',
        owner: 'task-environment',
        capability: requirement.capability,
        project: requirement.project,
        selector: requirement.selector,
        recipe: requirement.recipe,
        status: !planned ? 'unplanned' : current?.status || 'missing',
        diagnostic: !planned ? `Selected capability preparation is not bound to the current Environment Plan: ${requirement.selector}/${requirement.recipe}` : current?.diagnostic || `Preparation Recipe is not current: ${requirement.selector}/${requirement.recipe}`,
        recoverable: true,
      });
      recoverable.push(requirement);
    }
  }
  const status = gaps.length ? 'blocked' : 'ready';
  return {
    status,
    identity: digest({ ...binding, status, gaps }),
    binding,
    requirements: uniqueRequirements,
    gaps,
    recovery: recoverable.length ? {
      owner: 'task-environment',
      changesTaskScope: false,
      blocks: ['formal-verification-execution', 'formal-verification-result', 'completion-claim'],
      doesNotBlock: ['unrelated-development', 'read-only-investigation', 'bounded-informal-checks'],
      planRequest: recoveryRequest(context, uniqueRequirements),
    } : null,
  };
}
