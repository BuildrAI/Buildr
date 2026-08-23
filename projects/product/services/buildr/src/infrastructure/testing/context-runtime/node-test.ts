import fs from 'node:fs';
import nodeTest, { after } from 'node:test';

import { createTestContextRuntime } from './runtime.js';
import type {
  ContextTestCallback,
  ContextTestOptions,
  NodeTestContextAdapter,
  TestContextLease,
  TestContextRequests,
  TestContextRuntime,
} from './types.js';

const DEFAULT_RUNTIME = Symbol.for('@buildr-ai/test-context/default-node-runtime');
const DEFAULT_ADAPTER = Symbol.for('@buildr-ai/test-context/default-node-adapter');
const DIRECT_HOOK = Symbol.for('@buildr-ai/test-context/direct-close-hook');
const HOST_HOOK = Symbol.for('@buildr-ai/test-context/host-close-hook');

type GlobalContextState = typeof globalThis & Record<symbol, unknown>;
const globalState = globalThis as GlobalContextState;

export function defaultNodeTestContextRuntime(): TestContextRuntime {
  globalState[DEFAULT_RUNTIME] ??= createTestContextRuntime({
    onEvent: process.env.NODE_TEST_CONTEXT_EVENTS_FILE
      ? (event) => fs.appendFileSync(process.env.NODE_TEST_CONTEXT_EVENTS_FILE!, `${JSON.stringify(event)}\n`)
      : undefined,
  });
  return globalState[DEFAULT_RUNTIME] as TestContextRuntime;
}

export async function closeDefaultNodeTestContextRuntime(): Promise<Readonly<{ status: string; events?: readonly unknown[] }>> {
  const runtime = globalState[DEFAULT_RUNTIME] as TestContextRuntime | undefined;
  if (!runtime) return Object.freeze({ status: 'not-created' });
  delete globalState[DEFAULT_ADAPTER];
  delete globalState[DEFAULT_RUNTIME];
  return runtime.close();
}

function splitOptions<Requests extends TestContextRequests>(options: ContextTestOptions<Requests>) {
  const { contexts, suiteId, ...nodeOptions } = options;
  return { contexts, suiteId, nodeOptions };
}

interface CreateNodeTestContextAdapterOptions {
  runtime?: TestContextRuntime;
  test?: (name: string, options: object, callback: (context: any) => Promise<unknown>) => unknown;
  suiteId?: string;
}

export function createNodeTestContextAdapter(options: CreateNodeTestContextAdapterOptions = {}): NodeTestContextAdapter {
  const runtime = options.runtime ?? defaultNodeTestContextRuntime();
  const implementation = options.test ?? (nodeTest as unknown as CreateNodeTestContextAdapterOptions['test'])!;
  const defaultSuiteId = options.suiteId ?? 'node-test-context';
  let registration = 0;
  const contextTest = <Requests extends TestContextRequests>(
    name: string,
    testOptions: ContextTestOptions<Requests>,
    callback: ContextTestCallback<Requests>,
  ): unknown => {
    if (typeof callback !== 'function') throw new TypeError('Context test callback is required.');
    const current = splitOptions(testOptions);
    if (!current.contexts || Object.keys(current.contexts).length === 0) throw new TypeError('Context test requires at least one contexts entry.');
    const testId = `${defaultSuiteId}:${++registration}:${name}`;
    return implementation(name, current.nodeOptions, async (t) => {
      const acquire = runtime.acquire as unknown as (
        requests: Requests,
        owner: { suiteId: string; testId: string; name: string },
      ) => Promise<TestContextLease<Requests>>;
      const lease = await acquire(current.contexts, { suiteId: current.suiteId ?? defaultSuiteId, testId, name });
      const bodyStartedAt = Date.now();
      let outcome = 'passed';
      let bodyFailure: unknown = null;
      try {
        return await callback(t, lease.values, Object.freeze({ identities: lease.identities, markDirty: lease.markDirty.bind(lease) }));
      } catch (error) {
        outcome = 'failed';
        bodyFailure = error;
        throw error;
      } finally {
        runtime.record({ operation: 'test-body', testId, name, status: outcome, durationMs: Date.now() - bodyStartedAt });
        try {
          await lease.release({ outcome });
        } catch (releaseFailure) {
          if (bodyFailure) throw new AggregateError([bodyFailure, releaseFailure], 'Test body and Context release both failed.');
          throw releaseFailure;
        }
      }
    });
  };
  return Object.freeze({ test: contextTest, runtime });
}

function defaultNodeTestContextAdapter(): NodeTestContextAdapter {
  globalState[DEFAULT_ADAPTER] ??= createNodeTestContextAdapter();
  return globalState[DEFAULT_ADAPTER] as NodeTestContextAdapter;
}

export function contextTest<Requests extends TestContextRequests>(
  name: string,
  options: ContextTestOptions<Requests>,
  callback: ContextTestCallback<Requests>,
): unknown {
  if (process.env.NODE_TEST_CONTEXT_HOST && !globalState[HOST_HOOK]) {
    globalState[HOST_HOOK] = true;
    process.once('beforeExit', async () => {
      try {
        await closeDefaultNodeTestContextRuntime();
      } catch (error) {
        const failure = error as Error;
        process.stderr.write(`# node-test-context close failed: ${failure.stack || failure.message}\n`);
        process.exitCode = 1;
      }
    });
  } else if (!process.env.NODE_TEST_CONTEXT_HOST && !globalState[DIRECT_HOOK]) {
    globalState[DIRECT_HOOK] = true;
    after(async () => closeDefaultNodeTestContextRuntime());
  }
  return defaultNodeTestContextAdapter().test(name, options, callback);
}
