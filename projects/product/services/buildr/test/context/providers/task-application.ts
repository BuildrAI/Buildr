import { defineTestContext } from '../../../test-context.mjs';
import { createRuntime } from '../../../src/bootstrap/runtime.ts';
import { createTestContextPool } from '../runtime.ts';
import { TEST_CONTEXT_PROVIDERS } from '../registry.ts';
import { TASK_LIFECYCLE_CONTEXT_KEY } from '../profiles.ts';

export const BUILDR_TASK_APPLICATION_CONTEXT_KEY: any = 'buildr.task-application/v1';
export const BUILDR_TASK_WORKSPACE_CONTEXT_KEY: any = 'buildr.task-workspace/v1';

function restoreApplicationRuntime(state: any): any  {
  for (const key of Reflect.ownKeys(state.runtime)) {
    if (!Object.hasOwn(state.descriptors, key)) {
      const descriptor: any = Object.getOwnPropertyDescriptor(state.runtime, key);
      if (descriptor?.configurable) delete state.runtime[key];
    }
  }
  Object.defineProperties(state.runtime, state.descriptors);
}

export const buildrTaskApplicationContext: any = defineTestContext({
  id: 'buildr.task-application',
  version: 1,
  scope: 'worker',
  parallelSafety: 'exclusive',
  sourceIdentity: 'buildr-bootstrap-runtime/v1',
  create(): any  {
    const runtime: any = createRuntime();
    return { runtime, descriptors: Object.getOwnPropertyDescriptors(runtime) };
  },
  acquire({ state }: any): any  {
    return state.runtime;
  },
  release({ state }: any): any  {
    restoreApplicationRuntime(state);
  },
  inspect({ state }: any): any  {
    const currentKeys: any = Reflect.ownKeys(state.runtime);
    const expectedKeys: any = Reflect.ownKeys(state.descriptors);
    return currentKeys.length === expectedKeys.length && expectedKeys.every((key: any) => Object.hasOwn(state.runtime, key))
      ? 'clean'
      : { dirty: true, reason: 'buildr-runtime-property-drift' };
  },
});

export const buildrTaskWorkspaceContext: any = defineTestContext({
  id: 'buildr.task-workspace',
  version: 1,
  scope: 'worker',
  parallelSafety: 'isolated',
  sourceIdentity: TASK_LIFECYCLE_CONTEXT_KEY,
  create(): any  {
    const pool: any = createTestContextPool({ providers: TEST_CONTEXT_PROVIDERS });
    const prepared: any = pool.prepare(TASK_LIFECYCLE_CONTEXT_KEY);
    return { pool, identity: prepared.marker.identity };
  },
  acquire({ state, owner, record }: any): any  {
    const lease: any = state.pool.acquire(TASK_LIFECYCLE_CONTEXT_KEY, { name: owner.testId });
    record({ operation: 'provider-materialize', context: BUILDR_TASK_WORKSPACE_CONTEXT_KEY, durationMs: lease.timing.materializeDurationMs, identity: lease.context.identity });
    return lease;
  },
  release({ value, record }: any): any  {
    const result: any = value.release();
    record({ operation: 'provider-cleanup', context: BUILDR_TASK_WORKSPACE_CONTEXT_KEY, durationMs: result.cleanupDurationMs, status: result.status });
  },
  destroy({ state }: any): any  {
    state.pool.cleanup();
  },
});

export const BUILDR_TASK_TEST_CONTEXTS: any = Object.freeze({
  application: buildrTaskApplicationContext,
  workspace: buildrTaskWorkspaceContext,
});

export const buildrApplicationContext: any = buildrTaskApplicationContext;
export const buildrWorkspaceContext: any = buildrTaskWorkspaceContext;
export const BUILDR_APPLICATION_TEST_CONTEXTS: any = Object.freeze({
  application: buildrApplicationContext,
});
export const BUILDR_APPLICATION_WORKSPACE_TEST_CONTEXTS: any = BUILDR_TASK_TEST_CONTEXTS;
