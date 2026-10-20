import { createTestContextPool } from './runtime.ts';
import { TEST_CONTEXT_PROVIDERS } from './registry.ts';
import process from 'node:process';

let defaultPool: any = null;

// This owner must finish before the preload removes its enclosing state root.
process.prependOnceListener('exit', () => {
  try { cleanupDefaultTestContextPool(); }
  catch (error: any) {
    process.stderr.write(`Default test context cleanup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
});

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
  const pool = defaultPool;
  defaultPool = null;
  return pool.cleanup();
}
