import type { ContextTestCallback, ContextTestOptions, NodeTestContextAdapter, TestContextRequests, TestContextRuntime } from './types.js';
export declare function defaultNodeTestContextRuntime(): TestContextRuntime;
export declare function closeDefaultNodeTestContextRuntime(): Promise<Readonly<{
    status: string;
    events?: readonly unknown[];
}>>;
interface CreateNodeTestContextAdapterOptions {
    runtime?: TestContextRuntime;
    test?: (name: string, options: object, callback: (context: any) => Promise<unknown>) => unknown;
    suiteId?: string;
}
export declare function createNodeTestContextAdapter(options?: CreateNodeTestContextAdapterOptions): NodeTestContextAdapter;
export declare function contextTest<Requests extends TestContextRequests>(name: string, options: ContextTestOptions<Requests>, callback: ContextTestCallback<Requests>): unknown;
export {};
