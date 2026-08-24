import fs from 'node:fs';
import nodeTest, { after } from 'node:test';
import { createTestContextRuntime } from './runtime.js';
const DEFAULT_RUNTIME = Symbol.for('@buildr-ai/test-context/default-node-runtime');
const DEFAULT_ADAPTER = Symbol.for('@buildr-ai/test-context/default-node-adapter');
const DIRECT_HOOK = Symbol.for('@buildr-ai/test-context/direct-close-hook');
const HOST_HOOK = Symbol.for('@buildr-ai/test-context/host-close-hook');
const globalState = globalThis;
export function defaultNodeTestContextRuntime() {
    globalState[DEFAULT_RUNTIME] ??= createTestContextRuntime({
        onEvent: process.env.NODE_TEST_CONTEXT_EVENTS_FILE
            ? (event) => fs.appendFileSync(process.env.NODE_TEST_CONTEXT_EVENTS_FILE, `${JSON.stringify(event)}\n`)
            : undefined,
    });
    return globalState[DEFAULT_RUNTIME];
}
export async function closeDefaultNodeTestContextRuntime() {
    const runtime = globalState[DEFAULT_RUNTIME];
    if (!runtime)
        return Object.freeze({ status: 'not-created' });
    delete globalState[DEFAULT_ADAPTER];
    delete globalState[DEFAULT_RUNTIME];
    return runtime.close();
}
function splitOptions(options) {
    const { contexts, suiteId, ...nodeOptions } = options;
    return { contexts, suiteId, nodeOptions };
}
export function createNodeTestContextAdapter(options = {}) {
    const runtime = options.runtime ?? defaultNodeTestContextRuntime();
    const implementation = options.test ?? nodeTest;
    const defaultSuiteId = options.suiteId ?? 'node-test-context';
    let registration = 0;
    const contextTest = (name, testOptions, callback) => {
        if (typeof callback !== 'function')
            throw new TypeError('Context test callback is required.');
        const current = splitOptions(testOptions);
        if (!current.contexts || Object.keys(current.contexts).length === 0)
            throw new TypeError('Context test requires at least one contexts entry.');
        const testId = `${defaultSuiteId}:${++registration}:${name}`;
        return implementation(name, current.nodeOptions, async (t) => {
            const acquire = runtime.acquire;
            const lease = await acquire(current.contexts, { suiteId: current.suiteId ?? defaultSuiteId, testId, name });
            const bodyStartedAt = Date.now();
            let outcome = 'passed';
            let bodyFailure = null;
            try {
                return await callback(t, lease.values, Object.freeze({ identities: lease.identities, markDirty: lease.markDirty.bind(lease) }));
            }
            catch (error) {
                outcome = 'failed';
                bodyFailure = error;
                throw error;
            }
            finally {
                runtime.record({ operation: 'test-body', testId, name, status: outcome, durationMs: Date.now() - bodyStartedAt });
                try {
                    await lease.release({ outcome });
                }
                catch (releaseFailure) {
                    if (bodyFailure)
                        throw new AggregateError([bodyFailure, releaseFailure], 'Test body and Context release both failed.');
                    throw releaseFailure;
                }
            }
        });
    };
    return Object.freeze({ test: contextTest, runtime });
}
function defaultNodeTestContextAdapter() {
    globalState[DEFAULT_ADAPTER] ??= createNodeTestContextAdapter();
    return globalState[DEFAULT_ADAPTER];
}
export function contextTest(name, options, callback) {
    if (process.env.NODE_TEST_CONTEXT_HOST && !globalState[HOST_HOOK]) {
        globalState[HOST_HOOK] = true;
        process.once('beforeExit', async () => {
            try {
                await closeDefaultNodeTestContextRuntime();
            }
            catch (error) {
                const failure = error;
                process.stderr.write(`# node-test-context close failed: ${failure.stack || failure.message}\n`);
                process.exitCode = 1;
            }
        });
    }
    else if (!process.env.NODE_TEST_CONTEXT_HOST && !globalState[DIRECT_HOOK]) {
        globalState[DIRECT_HOOK] = true;
        after(async () => closeDefaultNodeTestContextRuntime());
    }
    return defaultNodeTestContextAdapter().test(name, options, callback);
}
