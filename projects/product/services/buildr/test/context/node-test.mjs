import { createTestContextPool } from './runtime.mjs';
import { TEST_CONTEXT_PROVIDERS } from './registry.mjs';

let defaultPool = null;

export function defaultTestContextPool(options = {}) {
  defaultPool ??= createTestContextPool({ providers: TEST_CONTEXT_PROVIDERS, ...options });
  return defaultPool;
}

export function acquireNodeTestContext(t, key, options = {}) {
  if (!t || typeof t.after !== 'function') throw new Error('test_context_node_test_adapter_invalid: node:test context is required.');
  const lease = defaultTestContextPool().acquire(key, options);
  t.after(() => lease.release());
  return lease;
}

export function cleanupDefaultTestContextPool() {
  if (!defaultPool) return { status: 'not-owned' };
  const result = defaultPool.cleanup();
  defaultPool = null;
  return result;
}
