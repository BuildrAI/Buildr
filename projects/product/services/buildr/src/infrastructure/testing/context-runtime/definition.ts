import crypto from 'node:crypto';

import type {
  AnyTestContextDefinition,
  JsonValue,
  NormalizedTestContextDependency,
  NormalizedTestContextRequest,
  TestContextDefinition,
  TestContextDefinitionInput,
  TestContextDependency,
  TestContextError,
  TestContextRequest,
} from './types.js';

const DEFINITION = Symbol.for('@buildr-ai/test-context/definition');
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;
const SCOPES = new Set(['worker', 'suite', 'test']);
const PARALLEL_SAFETY = new Set(['shared', 'exclusive', 'isolated']);

type UnknownRecord = Record<PropertyKey, unknown>;

export function testContextError(code: string, message: string, details: Record<string, unknown> = {}): TestContextError {
  const error = new Error(`${code}: ${message}`) as TestContextError;
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeSerializable(value: unknown, location = '$', seen = new Set<object>()): JsonValue {
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
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) throw testContextError('test_context_configuration_invalid', 'Context configuration must not contain undefined values.', { location: `${location}.${key}` });
      result[key] = normalizeSerializable(value[key], `${location}.${key}`, seen);
    }
    seen.delete(value);
    return result;
  }
  throw testContextError('test_context_configuration_invalid', 'Context configuration must contain only deterministic JSON values.', { location, type: typeof value });
}

export function canonicalContextConfiguration(value: unknown = {}): string {
  return JSON.stringify(normalizeSerializable(value));
}

export function contextConfigurationIdentity(value: unknown = {}): string {
  return `sha256-${crypto.createHash('sha256').update(canonicalContextConfiguration(value)).digest('hex')}`;
}

export function isTestContextDefinition(value: unknown): value is AnyTestContextDefinition {
  return Boolean((value as UnknownRecord | null)?.[DEFINITION]);
}

function dependencyDefinition(value: unknown, owner: string): NormalizedTestContextDependency {
  const dependency = isTestContextDefinition(value) ? { definition: value } : value;
  if (!plainObject(dependency) || !isTestContextDefinition(dependency.definition)) {
    throw testContextError('test_context_definition_invalid', `Context ${owner} has an invalid dependency.`);
  }
  if (dependency.config != null && typeof dependency.config !== 'function' && !plainObject(dependency.config)) {
    throw testContextError('test_context_definition_invalid', `Context ${owner} dependency config must be an object or function.`);
  }
  return Object.freeze({
    definition: dependency.definition,
    config: (dependency.config ?? {}) as JsonValue | ((parentConfig: JsonValue) => JsonValue),
  });
}

export function defineTestContext<
  const Id extends string,
  State,
  Config extends JsonValue = Record<string, never>,
  Acquired = State,
  const Dependencies extends readonly TestContextDependency[] = readonly [],
>(input: TestContextDefinitionInput<Id, State, Config, Acquired, Dependencies>): TestContextDefinition<Id, State, Config, Acquired>;
export function defineTestContext(input: TestContextDefinitionInput<string, unknown, JsonValue, unknown, readonly TestContextDependency[]>): AnyTestContextDefinition {
  if (!plainObject(input)) throw testContextError('test_context_definition_invalid', 'Context definition must be an object.');
  if (!KEY_PATTERN.test(input.id ?? '')) throw testContextError('test_context_definition_invalid', 'Context id must be a stable kebab/dotted identifier.', { id: input.id ?? null });
  if (!Number.isInteger(input.version) || input.version < 1) throw testContextError('test_context_definition_invalid', `Context ${input.id} version must be a positive integer.`);
  if (!SCOPES.has(input.scope)) throw testContextError('test_context_definition_invalid', `Context ${input.id} has an invalid scope.`, { scope: input.scope });
  if (!PARALLEL_SAFETY.has(input.parallelSafety)) throw testContextError('test_context_definition_invalid', `Context ${input.id} has invalid parallel safety.`, { parallelSafety: input.parallelSafety });
  if (typeof input.create !== 'function') throw testContextError('test_context_definition_invalid', `Context ${input.id} is missing create().`);
  for (const hook of ['acquire', 'release', 'reset', 'inspect', 'destroy'] as const) {
    if (input[hook] != null && typeof input[hook] !== 'function') throw testContextError('test_context_definition_invalid', `Context ${input.id} ${hook} must be a function.`);
  }
  if (input.sourceIdentity != null && typeof input.sourceIdentity !== 'string' && typeof input.sourceIdentity !== 'function') {
    throw testContextError('test_context_definition_invalid', `Context ${input.id} sourceIdentity must be a string or function.`);
  }
  const key = `${input.id}/v${input.version}` as `${string}/v${number}`;
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
  return Object.freeze(definition) as unknown as AnyTestContextDefinition;
}

export function normalizeContextRequest<Definition extends AnyTestContextDefinition>(
  value: TestContextRequest<Definition>,
  alias: string | null = null,
): NormalizedTestContextRequest<Definition> {
  const request = isTestContextDefinition(value) ? { definition: value } : value;
  if (!request || !isTestContextDefinition(request.definition)) throw testContextError('test_context_request_invalid', 'Context request must reference a definition.', { alias });
  const config = (request.config ?? {}) as JsonValue;
  canonicalContextConfiguration(config);
  return Object.freeze({ alias: alias ?? request.definition.id, definition: request.definition as Definition, config });
}
