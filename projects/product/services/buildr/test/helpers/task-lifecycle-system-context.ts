import process from 'node:process';

import { cleanupDefaultTestContextPool, defaultTestContextPool } from '../context/node-test.ts';
import { createTestContextPool, inspectTestContext } from '../context/runtime.ts';
import { createTaskLifecycleContextProvider, taskLifecycleContextProvider, TASK_LIFECYCLE_CONTEXT_KEY } from '../context/providers/task-lifecycle.ts';

export const TASK_LIFECYCLE_CONTEXT_ENV: any = 'BUILDR_SYSTEM_TASK_LIFECYCLE_CONTEXT';
export const TASK_LIFECYCLE_CONTEXT_ID: any = TASK_LIFECYCLE_CONTEXT_KEY;

function compatibleContext(inspected: any): any  {
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

export function inspectTaskLifecycleSystemContext(contextRoot: any): any  {
  return compatibleContext(inspectTestContext(contextRoot, taskLifecycleContextProvider));
}

export function prepareTaskLifecycleSystemContext({ runtime }: any = {}): any  {
  const provider: any = runtime ? createTaskLifecycleContextProvider({ runtime }) : taskLifecycleContextProvider;
  const pool: any = createTestContextPool({ providers: [provider] });
  const context: any = pool.prepare(TASK_LIFECYCLE_CONTEXT_KEY);
  const compatible: any = compatibleContext(context);
  return {
    ...compatible,
    cleanup(): any  {
      const result: any = pool.cleanup();
      return { status: result.status, identity: compatible.marker.identity };
    },
  };
}

function currentPool(): any  {
  const legacyRoot: any = process.env[TASK_LIFECYCLE_CONTEXT_ENV];
  return defaultTestContextPool(legacyRoot ? { inheritedContexts: { [TASK_LIFECYCLE_CONTEXT_KEY]: legacyRoot } } : {});
}

export function copyTaskLifecycleWorkspace(t: any, name: any = 'task-lifecycle'): any  {
  const lease: any = currentPool().acquire(TASK_LIFECYCLE_CONTEXT_KEY, { name });
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

export function cleanupLocalTaskLifecycleSystemContext(): any  {
  return cleanupDefaultTestContextPool();
}
