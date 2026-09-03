import { defineTestContext } from '../../../test-context.mjs';
import { createRuntime } from '../../../src/bootstrap/runtime.ts';
import { createTestContextPool } from '../runtime.mjs';
import { TEST_CONTEXT_PROVIDERS } from '../registry.mjs';
import { TASK_LIFECYCLE_CONTEXT_KEY } from '../profiles.mjs';

export const BUILDR_TASK_APPLICATION_CONTEXT_KEY = 'buildr.task-application/v1';
export const BUILDR_TASK_WORKSPACE_CONTEXT_KEY = 'buildr.task-workspace/v1';

function restoreApplicationRuntime(state) {
  for (const key of Reflect.ownKeys(state.runtime)) {
    if (!Object.hasOwn(state.descriptors, key)) {
      const descriptor = Object.getOwnPropertyDescriptor(state.runtime, key);
      if (descriptor?.configurable) delete state.runtime[key];
    }
  }
  Object.defineProperties(state.runtime, state.descriptors);
}

export const buildrTaskApplicationContext = defineTestContext({
  id: 'buildr.task-application',
  version: 1,
  scope: 'worker',
  parallelSafety: 'exclusive',
  sourceIdentity: 'buildr-bootstrap-runtime/v1',
  create() {
    const runtime = createRuntime();
    return { runtime, descriptors: Object.getOwnPropertyDescriptors(runtime) };
  },
  acquire({ state }) {
    return state.runtime;
  },
  release({ state }) {
    restoreApplicationRuntime(state);
  },
  inspect({ state }) {
    const currentKeys = Reflect.ownKeys(state.runtime);
    const expectedKeys = Reflect.ownKeys(state.descriptors);
    return currentKeys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(state.runtime, key))
      ? 'clean'
      : { dirty: true, reason: 'buildr-runtime-property-drift' };
  },
});

export const buildrTaskWorkspaceContext = defineTestContext({
  id: 'buildr.task-workspace',
  version: 1,
  scope: 'worker',
  parallelSafety: 'isolated',
  sourceIdentity: TASK_LIFECYCLE_CONTEXT_KEY,
  create() {
    const pool = createTestContextPool({ providers: TEST_CONTEXT_PROVIDERS });
    const prepared = pool.prepare(TASK_LIFECYCLE_CONTEXT_KEY);
    return { pool, identity: prepared.marker.identity };
  },
  acquire({ state, owner, record }) {
    const lease = state.pool.acquire(TASK_LIFECYCLE_CONTEXT_KEY, { name: owner.testId });
    record({ operation: 'provider-materialize', context: BUILDR_TASK_WORKSPACE_CONTEXT_KEY, durationMs: lease.timing.materializeDurationMs, identity: lease.context.identity });
    return lease;
  },
  release({ value, record }) {
    const result = value.release();
    record({ operation: 'provider-cleanup', context: BUILDR_TASK_WORKSPACE_CONTEXT_KEY, durationMs: result.cleanupDurationMs, status: result.status });
  },
  destroy({ state }) {
    state.pool.cleanup();
  },
});

export const BUILDR_TASK_TEST_CONTEXTS = Object.freeze({
  application: buildrTaskApplicationContext,
  workspace: buildrTaskWorkspaceContext,
});

export const buildrApplicationContext = buildrTaskApplicationContext;
export const buildrWorkspaceContext = buildrTaskWorkspaceContext;
export const BUILDR_APPLICATION_TEST_CONTEXTS = Object.freeze({
  application: buildrApplicationContext,
});
export const BUILDR_APPLICATION_WORKSPACE_TEST_CONTEXTS = BUILDR_TASK_TEST_CONTEXTS;
