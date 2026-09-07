const DEFINITION_FIELDS: any = new Set(['id', 'requires', 'create']);
const DESCRIPTOR_FIELDS: any = new Set(['provides', 'contributions', 'lifecycle']);
const CONTRIBUTION_TYPES = Object.freeze(['cli', 'http', 'diagnostics']);

function moduleError(code: any, message: any, details: any = undefined, cause: any = undefined): any  {
  const error: Error & Record<string, any> = new Error(message, cause === undefined ? undefined : { cause });
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function plainObject(value: any): any  {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertClosedObject(value: any, allowed: any, label: any, code: any): any  {
  if (!plainObject(value)) throw moduleError(code, `${label} must be an object.`);
  const field = Object.keys(value).find((candidate: any) => !allowed.has(candidate));
  if (field) throw moduleError(code, `${label} contains unsupported field: ${field}.`, { field });
}

function identity(value: any, label: any, code: any): any  {
  if (typeof value !== 'string' || !value.trim()) throw moduleError(code, `${label} must be a non-empty string.`);
  return value.trim();
}

function uniqueIdentities(values: any, label: any, code: any): any  {
  if (!Array.isArray(values)) throw moduleError(code, `${label} must be an array.`);
  const result: any[] = [];
  const seen: any = new Set();
  for (const value of values) {
    const normalized = identity(value, label, code);
    if (seen.has(normalized)) throw moduleError(code, `${label} contains duplicate identity: ${normalized}.`, { identity: normalized });
    seen.add(normalized);
    result.push(normalized);
  }
  return Object.freeze(result);
}

export function defineModule(definition: any): any  {
  assertClosedObject(definition, DEFINITION_FIELDS, 'Module definition', 'bootstrap_module_definition_invalid');
  const id = identity(definition.id, 'Module id', 'bootstrap_module_definition_invalid');
  const requires = uniqueIdentities(definition.requires || [], `Module ${id} requires`, 'bootstrap_module_definition_invalid');
  if (typeof definition.create !== 'function') throw moduleError('bootstrap_module_definition_invalid', `Module ${id} create must be a function.`, { module: id });
  return Object.freeze({ id, requires, create: definition.create });
}

function normalizeContributions(moduleId: any, input: any = {}): any  {
  assertClosedObject(input, new Set(CONTRIBUTION_TYPES), `Module ${moduleId} contributions`, 'bootstrap_module_descriptor_invalid');
  return Object.freeze(Object.fromEntries(CONTRIBUTION_TYPES.map((type: any) => {
    const values = input[type] || [];
    if (!Array.isArray(values)) throw moduleError('bootstrap_module_descriptor_invalid', `Module ${moduleId} ${type} contributions must be an array.`, { module: moduleId, type });
    const seen: any = new Set();
    const normalized = values.map((value: any) => {
      if (!plainObject(value)) throw moduleError('bootstrap_module_descriptor_invalid', `Module ${moduleId} ${type} contribution must be an object.`, { module: moduleId, type });
      const contributionIdentity = identity(value.id ?? value.key, `Module ${moduleId} ${type} contribution identity`, 'bootstrap_module_descriptor_invalid');
      if (seen.has(contributionIdentity)) throw moduleError('bootstrap_module_contribution_duplicate', `Module ${moduleId} repeats ${type} contribution: ${contributionIdentity}.`, { module: moduleId, type, identity: contributionIdentity });
      seen.add(contributionIdentity);
      return Object.freeze(value.id === undefined ? { ...value, id: contributionIdentity } : { ...value });
    });
    return [type, Object.freeze(normalized)];
  })));
}

function normalizeLifecycle(moduleId: any, lifecycle: any): any  {
  if (lifecycle === undefined || lifecycle === null) return null;
  assertClosedObject(lifecycle, new Set(['start', 'stop']), `Module ${moduleId} lifecycle`, 'bootstrap_module_lifecycle_invalid');
  if (typeof lifecycle.start !== 'function' || typeof lifecycle.stop !== 'function') {
    throw moduleError('bootstrap_module_lifecycle_invalid', `Module ${moduleId} lifecycle must provide both start and stop.`, { module: moduleId });
  }
  return Object.freeze({ start: lifecycle.start, stop: lifecycle.stop });
}

export function createModuleRegistry({ capabilities = {} }: any = {}): any  {
  if (!plainObject(capabilities)) throw moduleError('bootstrap_module_capabilities_invalid', 'Bootstrap capabilities must be an object.');
  const providers: any = new Map(Object.entries(capabilities));
  const modules: any[] = [];
  const moduleIds: any = new Set();
  const contributionOwners: any = new Map(CONTRIBUTION_TYPES.map((type: any) => [type, new Map()]));
  let started: any[] = [];

  function install(rawDefinition: any): any  {
    const definition = defineModule(rawDefinition);
    if (moduleIds.has(definition.id)) throw moduleError('bootstrap_module_duplicate', `Duplicate module id: ${definition.id}.`, { module: definition.id });
    const missing = definition.requires.filter((required: any) => !providers.has(required));
    if (missing.length) throw moduleError('bootstrap_module_dependency_missing', `Module ${definition.id} is missing required capabilities: ${missing.join(', ')}.`, { module: definition.id, missing });

    const requires = Object.freeze(Object.fromEntries(definition.requires.map((required: any) => [required, providers.get(required)])));
    const created = definition.create(requires) || {};
    assertClosedObject(created, DESCRIPTOR_FIELDS, `Module ${definition.id} descriptor`, 'bootstrap_module_descriptor_invalid');
    const provides = created.provides || {};
    assertClosedObject(provides, new Set(Object.keys(provides)), `Module ${definition.id} provides`, 'bootstrap_module_descriptor_invalid');
    for (const capability of Object.keys(provides)) {
      identity(capability, `Module ${definition.id} provide identity`, 'bootstrap_module_descriptor_invalid');
      if (providers.has(capability)) throw moduleError('bootstrap_module_provide_duplicate', `Capability ${capability} is already provided before module ${definition.id}.`, { module: definition.id, capability });
    }
    const contributions = normalizeContributions(definition.id, created.contributions);
    for (const type of CONTRIBUTION_TYPES) {
      for (const contribution of contributions[type]) {
        const contributionIdentity = contribution.id;
        const existing = contributionOwners.get(type).get(contributionIdentity);
        if (existing) throw moduleError('bootstrap_module_contribution_duplicate', `${type} contribution ${contributionIdentity} is provided by both ${existing} and ${definition.id}.`, { type, identity: contributionIdentity, modules: [existing, definition.id] });
      }
    }
    const descriptor = Object.freeze({
      id: definition.id,
      requires: definition.requires,
      provides: Object.freeze({ ...provides }),
      contributions,
      lifecycle: normalizeLifecycle(definition.id, created.lifecycle),
    });

    moduleIds.add(definition.id);
    modules.push(descriptor);
    for (const [capability, value] of Object.entries(descriptor.provides)) providers.set(capability, value);
    for (const type of CONTRIBUTION_TYPES) {
      for (const contribution of descriptor.contributions[type]) contributionOwners.get(type).set(contribution.id, definition.id);
    }
    return descriptor;
  }

  function provide(capability: any): any  {
    const id = identity(capability, 'Capability identity', 'bootstrap_module_capability_invalid');
    if (!providers.has(id)) throw moduleError('bootstrap_module_capability_missing', `Bootstrap capability is not available: ${id}.`, { capability: id });
    return providers.get(id);
  }

  function contributions(type: any): any  {
    if (!CONTRIBUTION_TYPES.includes(type)) throw moduleError('bootstrap_module_contribution_type_invalid', `Unsupported contribution type: ${type}.`, { type });
    return Object.freeze(modules.flatMap((descriptor: any) => descriptor.contributions[type]));
  }

  async function stopDescriptors(descriptors: any): Promise<any>  {
    const failures: any[] = [];
    for (const descriptor of [...descriptors].reverse()) {
      if (!descriptor.lifecycle) continue;
      try { await descriptor.lifecycle.stop(); }
      catch (error: any) { failures.push({ module: descriptor.id, error }); }
    }
    return failures;
  }

  async function start(): Promise<any>  {
    if (started.length) return Object.freeze([...started]);
    const completed: any[] = [];
    try {
      for (const descriptor of modules) {
        if (!descriptor.lifecycle) continue;
        await descriptor.lifecycle.start();
        completed.push(descriptor);
      }
      started = completed;
      return Object.freeze([...completed]);
    } catch (error: any) {
      const cleanupFailures = await stopDescriptors(completed);
      started = [];
      throw moduleError('bootstrap_module_start_failed', `Bootstrap module lifecycle start failed: ${error.message}`, { cleanupFailures: cleanupFailures.map(({ module, error: failure }: any) => ({ module, message: failure.message })) }, error);
    }
  }

  async function stop(): Promise<any>  {
    const current = started;
    started = [];
    const failures = await stopDescriptors(current);
    if (failures.length) throw moduleError('bootstrap_module_stop_failed', `Bootstrap module lifecycle stop failed for: ${failures.map(({ module }: any) => module).join(', ')}.`, { failures: failures.map(({ module, error }: any) => ({ module, message: error.message })) });
  }

  function snapshot(): any  {
    return Object.freeze(modules.map((descriptor: any) => Object.freeze({
      id: descriptor.id,
      requires: descriptor.requires,
      provides: Object.freeze(Object.keys(descriptor.provides)),
      contributions: Object.freeze(Object.fromEntries(CONTRIBUTION_TYPES.map((type: any) => [type, Object.freeze(descriptor.contributions[type].map((item: any) => item.id))]))),
      lifecycle: descriptor.lifecycle ? 'managed' : 'none',
    })));
  }

  return Object.freeze({ install, provide, contributions, start, stop, snapshot });
}
