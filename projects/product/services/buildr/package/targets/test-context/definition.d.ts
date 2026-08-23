import type { AnyTestContextDefinition, JsonValue, NormalizedTestContextRequest, TestContextDefinition, TestContextDefinitionInput, TestContextDependency, TestContextError, TestContextRequest } from './types.js';
export declare function testContextError(code: string, message: string, details?: Record<string, unknown>): TestContextError;
export declare function canonicalContextConfiguration(value?: unknown): string;
export declare function contextConfigurationIdentity(value?: unknown): string;
export declare function isTestContextDefinition(value: unknown): value is AnyTestContextDefinition;
export declare function defineTestContext<const Id extends string, State, Config extends JsonValue = Record<string, never>, Acquired = State, const Dependencies extends readonly TestContextDependency[] = readonly []>(input: TestContextDefinitionInput<Id, State, Config, Acquired, Dependencies>): TestContextDefinition<Id, State, Config, Acquired>;
export declare function normalizeContextRequest<Definition extends AnyTestContextDefinition>(value: TestContextRequest<Definition>, alias?: string | null): NormalizedTestContextRequest<Definition>;
