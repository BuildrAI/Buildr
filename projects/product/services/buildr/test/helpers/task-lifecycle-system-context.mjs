import process from 'node:process';

import { cleanupDefaultTestContextPool, defaultTestContextPool } from '../context/node-test.mjs';
import { createTestContextPool, inspectTestContext } from '../context/runtime.mjs';
import { createTaskLifecycleContextProvider, taskLifecycleContextProvider, TASK_LIFECYCLE_CONTEXT_KEY } from '../context/providers/task-lifecycle.mjs';

export const TASK_LIFECYCLE_CONTEXT_ENV = 'BUILDR_SYSTEM_TASK_LIFECYCLE_CONTEXT';
export const TASK_LIFECYCLE_CONTEXT_ID = TASK_LIFECYCLE_CONTEXT_KEY;

function compatibleContext(inspected) {
  return {
    contextRoot: inspected.contextRoot,
    workspaceRoot: inspected.seedRoot,
    marker: {
      contextId: inspected.marker.provider,
      identity: inspected.marker.identity,
      setup: {
        applicationOperations: inspected.marker.providerData.applicationOperations,
        durationMs: inspected.marker.prepareDurationMs,
      },
    },
  };
}

export function inspectTaskLifecycleSystemContext(contextRoot) {
  return compatibleContext(inspectTestContext(contextRoot, taskLifecycleContextProvider));
}

export function prepareTaskLifecycleSystemContext({ runtime } = {}) {
  const provider = runtime ? createTaskLifecycleContextProvider({ runtime }) : taskLifecycleContextProvider;
  const pool = createTestContextPool({ providers: [provider] });
  const context = pool.prepare(TASK_LIFECYCLE_CONTEXT_KEY);
  const compatible = compatibleContext(context);
  return {
    ...compatible,
    cleanup() {
      const result = pool.cleanup();
      return { status: result.status, identity: compatible.marker.identity };
    },
  };
}

function currentPool() {
  const legacyRoot = process.env[TASK_LIFECYCLE_CONTEXT_ENV];
  return defaultTestContextPool(legacyRoot ? { inheritedContexts: { [TASK_LIFECYCLE_CONTEXT_KEY]: legacyRoot } } : {});
}

export function copyTaskLifecycleWorkspace(t, name = 'task-lifecycle') {
  const lease = currentPool().acquire(TASK_LIFECYCLE_CONTEXT_KEY, { name });
  t.after(() => lease.release());
  return {
    base: lease.base,
    root: lease.root,
    context: {
      id: lease.provider,
      identity: lease.context.identity,
      root: lease.context.root,
      setupApplicationOperations: lease.context.marker.providerData.applicationOperations,
      prepareDurationMs: lease.context.marker.prepareDurationMs,
      materializeDurationMs: lease.timing.materializeDurationMs,
    },
  };
}

export function cleanupLocalTaskLifecycleSystemContext() {
  return cleanupDefaultTestContextPool();
}
