import crypto from 'node:crypto';

const DEFINITION = Symbol.for('@buildr-ai/test-context/definition');
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;
const SCOPES = new Set(['worker', 'suite', 'test']);
const PARALLEL_SAFETY = new Set(['shared', 'exclusive', 'isolated']);

export function testContextError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.details = details;
  return error;
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeSerializable(value, location = '$', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) {
    if (seen.has(value)) throw testContextError('test_context_configuration_invalid', 'Context configuration must not contain cycles.', { location });
    seen.add(value);
    const result = value.map((item, index) => normalizeSerializable(item, `${location}[${index}]`, seen));
    seen.delete(value);
    return result;
  }
  if (plainObject(value)) {
    if (seen.has(value)) throw testContextError('test_context_configuration_invalid', 'Context configuration must not contain cycles.', { location });
    seen.add(value);
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) throw testContextError('test_context_configuration_invalid', 'Context configuration must not contain undefined values.', { location: `${location}.${key}` });
      result[key] = normalizeSerializable(value[key], `${location}.${key}`, seen);
    }
    seen.delete(value);
    return result;
  }
  throw testContextError('test_context_configuration_invalid', 'Context configuration must contain only deterministic JSON values.', { location, type: typeof value });
}

export function canonicalContextConfiguration(value = {}) {
  return JSON.stringify(normalizeSerializable(value));
}

export function contextConfigurationIdentity(value = {}) {
  return `sha256-${crypto.createHash('sha256').update(canonicalContextConfiguration(value)).digest('hex')}`;
}

export function isTestContextDefinition(value) {
  return Boolean(value?.[DEFINITION]);
}

function dependencyDefinition(value, owner) {
  const dependency = isTestContextDefinition(value) ? { definition: value } : value;
  if (!dependency || !isTestContextDefinition(dependency.definition)) {
    throw testContextError('test_context_definition_invalid', `Context ${owner} has an invalid dependency.`);
  }
  if (dependency.config != null && typeof dependency.config !== 'function' && !plainObject(dependency.config)) {
    throw testContextError('test_context_definition_invalid', `Context ${owner} dependency config must be an object or function.`);
  }
  return Object.freeze({ definition: dependency.definition, config: dependency.config ?? {} });
}

export function defineTestContext(input) {
  if (!plainObject(input)) throw testContextError('test_context_definition_invalid', 'Context definition must be an object.');
  if (!KEY_PATTERN.test(input.id ?? '')) throw testContextError('test_context_definition_invalid', 'Context id must be a stable kebab/dotted identifier.', { id: input.id ?? null });
  if (!Number.isInteger(input.version) || input.version < 1) throw testContextError('test_context_definition_invalid', `Context ${input.id} version must be a positive integer.`);
  if (!SCOPES.has(input.scope)) throw testContextError('test_context_definition_invalid', `Context ${input.id} has an invalid scope.`, { scope: input.scope });
  if (!PARALLEL_SAFETY.has(input.parallelSafety)) throw testContextError('test_context_definition_invalid', `Context ${input.id} has invalid parallel safety.`, { parallelSafety: input.parallelSafety });
  if (typeof input.create !== 'function') throw testContextError('test_context_definition_invalid', `Context ${input.id} is missing create().`);
  for (const hook of ['acquire', 'release', 'reset', 'inspect', 'destroy']) {
    if (input[hook] != null && typeof input[hook] !== 'function') throw testContextError('test_context_definition_invalid', `Context ${input.id} ${hook} must be a function.`);
  }
  if (input.sourceIdentity != null && typeof input.sourceIdentity !== 'string' && typeof input.sourceIdentity !== 'function') {
    throw testContextError('test_context_definition_invalid', `Context ${input.id} sourceIdentity must be a string or function.`);
  }
  const key = `${input.id}/v${input.version}`;
  const definition = {
    [DEFINITION]: true,
    id: input.id,
    version: input.version,
    key,
    scope: input.scope,
    parallelSafety: input.parallelSafety,
    dependencies: Object.freeze((input.dependencies ?? []).map((item) => dependencyDefinition(item, key))),
    create: input.create,
    acquire: input.acquire ?? null,
    release: input.release ?? null,
    reset: input.reset ?? null,
    inspect: input.inspect ?? null,
    destroy: input.destroy ?? null,
    sourceIdentity: input.sourceIdentity ?? null,
  };
  return Object.freeze(definition);
}

export function normalizeContextRequest(value, alias = null) {
  const request = isTestContextDefinition(value) ? { definition: value } : value;
  if (!request || !isTestContextDefinition(request.definition)) throw testContextError('test_context_request_invalid', 'Context request must reference a definition.', { alias });
  const config = request.config ?? {};
  canonicalContextConfiguration(config);
  return Object.freeze({ alias: alias ?? request.definition.id, definition: request.definition, config });
}

