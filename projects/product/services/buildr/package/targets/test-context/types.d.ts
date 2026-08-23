import type { TestContext, TestOptions } from 'node:test';
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
export type JsonObject = {
    [key: string]: JsonValue;
};
export type MaybePromise<T> = T | Promise<T>;
export type TestContextScope = 'worker' | 'suite' | 'test';
export type TestContextParallelSafety = 'shared' | 'exclusive' | 'isolated';
export type TestContextOutcome = 'passed' | 'failed' | 'unknown' | 'runtime-close' | string;
export interface TestContextOwner {
    suiteId?: string;
    testId?: string;
    name?: string;
    [key: string]: unknown;
}
export interface TestContextEvent {
    sequence: number;
    observedAt: string;
    pid: number;
    operation: string;
    context?: string;
    cacheKey?: string;
    identity?: string;
    scope?: string;
    durationMs?: number;
    status?: string;
    error?: string;
    reason?: string;
    owner?: TestContextOwner;
    contexts?: readonly string[];
    [key: string]: unknown;
}
export interface TestContextError extends Error {
    code: string;
    details: Readonly<Record<string, unknown>>;
}
export interface TestContextHookBase<Config extends JsonValue = JsonObject> {
    config: Config;
    identity: string;
    record: (event: Omit<TestContextEvent, 'sequence' | 'observedAt' | 'pid'>) => TestContextEvent;
}
export interface TestContextCreateHook<Config extends JsonValue, Dependencies extends Readonly<Record<string, unknown>>> extends TestContextHookBase<Config> {
    dependencies: Dependencies;
}
export interface TestContextAcquireHook<State, Config extends JsonValue> extends TestContextHookBase<Config> {
    state: State;
    owner: TestContextOwner;
}
export interface TestContextReleaseHook<State, Acquired, Config extends JsonValue> extends TestContextAcquireHook<State, Config> {
    value: Acquired;
    outcome: TestContextOutcome;
}
export interface TestContextResetHook<State, Config extends JsonValue> extends TestContextAcquireHook<State, Config> {
}
export interface TestContextDestroyHook<State, Config extends JsonValue> extends TestContextHookBase<Config> {
    state: State;
    reason: string;
}
export type TestContextInspection = boolean | 'clean' | 'dirty' | {
    status?: 'clean' | 'dirty';
    dirty?: boolean;
    reason?: string;
} | null | undefined;
export interface TestContextDefinition<Id extends string = string, State = unknown, Config extends JsonValue = JsonObject, Acquired = State> {
    readonly id: Id;
    readonly version: number;
    readonly key: `${Id}/v${number}`;
    readonly scope: TestContextScope;
    readonly parallelSafety: TestContextParallelSafety;
    readonly dependencies: readonly NormalizedTestContextDependency[];
    readonly create: (context: TestContextCreateHook<Config, Readonly<Record<string, unknown>>>) => MaybePromise<State>;
    readonly acquire: ((context: TestContextAcquireHook<State, Config>) => MaybePromise<Acquired>) | null;
    readonly release: ((context: TestContextReleaseHook<State, Acquired, Config>) => MaybePromise<void>) | null;
    readonly reset: ((context: TestContextResetHook<State, Config>) => MaybePromise<void>) | null;
    readonly inspect: ((context: TestContextReleaseHook<State, Acquired, Config>) => MaybePromise<TestContextInspection>) | null;
    readonly destroy: ((context: TestContextDestroyHook<State, Config>) => MaybePromise<void>) | null;
    readonly sourceIdentity: string | ((context: {
        config: Config;
    }) => MaybePromise<string>) | null;
}
export type AnyTestContextDefinition = TestContextDefinition<string, any, any, any>;
export type TestContextDependency<Definition extends AnyTestContextDefinition = AnyTestContextDefinition> = Definition | {
    definition: Definition;
    config?: JsonValue | ((parentConfig: JsonValue) => JsonValue);
};
export interface NormalizedTestContextDependency<Definition extends AnyTestContextDefinition = AnyTestContextDefinition> {
    readonly definition: Definition;
    readonly config: JsonValue | ((parentConfig: JsonValue) => JsonValue);
}
type DefinitionFromDependency<Value> = Value extends AnyTestContextDefinition ? Value : Value extends {
    definition: infer Definition extends AnyTestContextDefinition;
} ? Definition : never;
type StateOf<Definition> = Definition extends TestContextDefinition<any, infer State, any, any> ? State : never;
export type TestContextDependencyValues<Dependencies extends readonly TestContextDependency[]> = Readonly<{
    [Definition in DefinitionFromDependency<Dependencies[number]> as Definition['id']]: StateOf<Definition>;
}>;
export interface TestContextDefinitionInput<Id extends string, State, Config extends JsonValue, Acquired, Dependencies extends readonly TestContextDependency[]> {
    id: Id;
    version: number;
    scope: TestContextScope;
    parallelSafety: TestContextParallelSafety;
    dependencies?: Dependencies;
    create: (context: TestContextCreateHook<Config, TestContextDependencyValues<Dependencies>>) => MaybePromise<State>;
    acquire?: (context: TestContextAcquireHook<State, Config>) => MaybePromise<Acquired>;
    release?: (context: TestContextReleaseHook<State, Acquired, Config>) => MaybePromise<void>;
    reset?: (context: TestContextResetHook<State, Config>) => MaybePromise<void>;
    inspect?: (context: TestContextReleaseHook<State, Acquired, Config>) => MaybePromise<TestContextInspection>;
    destroy?: (context: TestContextDestroyHook<State, Config>) => MaybePromise<void>;
    sourceIdentity?: string | ((context: {
        config: Config;
    }) => MaybePromise<string>);
}
export type TestContextRequest<Definition extends AnyTestContextDefinition = AnyTestContextDefinition> = Definition | {
    definition: Definition;
    config?: Definition extends TestContextDefinition<any, any, infer Config, any> ? Config : never;
};
type ConfigOf<Definition> = Definition extends TestContextDefinition<any, any, infer Config, any> ? Config : never;
export interface NormalizedTestContextRequest<Definition extends AnyTestContextDefinition = AnyTestContextDefinition> {
    readonly alias: string;
    readonly definition: Definition;
    readonly config: JsonValue;
}
export type TestContextRequests = Record<string, unknown>;
export type CheckedTestContextRequests<Requests extends TestContextRequests> = {
    [Alias in keyof Requests]: Requests[Alias] extends infer Definition extends AnyTestContextDefinition ? Definition : Requests[Alias] extends {
        definition: infer Definition extends AnyTestContextDefinition;
    } ? Omit<Requests[Alias], 'config'> & {
        definition: Definition;
        config?: ConfigOf<Definition>;
    } : never;
};
type DefinitionFromRequest<Value> = Value extends AnyTestContextDefinition ? Value : Value extends {
    definition: infer Definition extends AnyTestContextDefinition;
} ? Definition : never;
type AcquiredOf<Definition> = Definition extends TestContextDefinition<any, any, any, infer Acquired> ? Acquired : never;
export type TestContextValues<Requests extends TestContextRequests> = Readonly<{
    [Alias in keyof Requests]: AcquiredOf<DefinitionFromRequest<Requests[Alias]>>;
}>;
export interface TestContextLeaseControl<Requests extends TestContextRequests> {
    readonly identities: Readonly<Record<keyof Requests & string, string>>;
    markDirty(alias: keyof Requests & string, reason?: string): void;
}
export interface TestContextLease<Requests extends TestContextRequests> extends TestContextLeaseControl<Requests> {
    readonly values: TestContextValues<Requests>;
    release(options?: {
        outcome?: TestContextOutcome;
    }): Promise<Readonly<{
        status: 'released' | 'already-released';
    }>>;
}
export interface TestContextRuntimeOptions {
    onEvent?: (event: TestContextEvent) => void;
}
export interface TestContextRuntime {
    acquire<const Requests extends TestContextRequests>(requests: Requests & CheckedTestContextRequests<Requests>, owner?: TestContextOwner): Promise<TestContextLease<Requests>>;
    closeSuite(suiteId: string): Promise<Readonly<{
        status: 'closed';
        suiteId: string;
        destroyed: number;
    }>>;
    close(): Promise<Readonly<{
        status: 'closed' | 'already-closed';
        events: readonly TestContextEvent[];
    }>>;
    record(event: Omit<TestContextEvent, 'sequence' | 'observedAt' | 'pid'>): TestContextEvent;
    events(): readonly TestContextEvent[];
    snapshot(): Readonly<{
        closed: boolean;
        entries: number;
        activeLeases: number;
        events: number;
    }>;
}
export interface ContextTestOptions<Requests extends TestContextRequests> extends TestOptions {
    contexts: Requests & CheckedTestContextRequests<Requests>;
    suiteId?: string;
}
export type ContextTestCallback<Requests extends TestContextRequests> = (context: TestContext, values: TestContextValues<Requests>, control: TestContextLeaseControl<Requests>) => unknown | Promise<unknown>;
export interface NodeTestContextAdapter {
    test<const Requests extends TestContextRequests>(name: string, options: ContextTestOptions<Requests>, callback: ContextTestCallback<Requests>): unknown;
    readonly runtime: TestContextRuntime;
}
export interface NodeTestContextFile {
    file: string;
    signature?: string;
}
export interface NodeTestContextHostResult {
    readonly host: number;
    readonly files: readonly string[];
    readonly events: readonly TestContextEvent[];
    readonly status: 'passed' | 'failed';
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly stdout: string;
    readonly stderr: string;
}
export interface NodeTestContextRunOptions {
    cwd?: string;
    files: readonly (string | NodeTestContextFile)[];
    workers?: number;
    nodeExecutable?: string;
    env?: NodeJS.ProcessEnv;
}
export interface NodeTestContextRunResult {
    readonly status: 'passed' | 'failed';
    readonly workerCount: number;
    readonly durationMs: number;
    readonly hosts: readonly NodeTestContextHostResult[];
    readonly events: readonly (TestContextEvent & {
        host: number;
    })[];
}
export {};
