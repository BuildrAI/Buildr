import { createTestContextPool } from './runtime.ts';
import { TEST_CONTEXT_PROVIDERS } from './registry.ts';

let defaultPool: any = null;

export function defaultTestContextPool(options: any = {}): any  {
  defaultPool ??= createTestContextPool({ providers: TEST_CONTEXT_PROVIDERS, ...options });
  return defaultPool;
}

export function acquireNodeTestContext(t: any, key: any, options: any = {}): any  {
  if (!t || typeof t.after !== 'function') throw new Error('test_context_node_test_adapter_invalid: node:test context is required.');
  const lease: any = defaultTestContextPool().acquire(key, options);
  t.after(() => lease.release());
  return lease;
}

export function cleanupDefaultTestContextPool(): any  {
  if (!defaultPool) return { status: 'not-owned' };
  const result: any = defaultPool.cleanup();
  defaultPool = null;
  return result;
}
