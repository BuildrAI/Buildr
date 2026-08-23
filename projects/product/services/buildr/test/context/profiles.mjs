export const TASK_LIFECYCLE_CONTEXT_KEY = 'task-lifecycle/v1';

export const TEST_CONTEXT_PROFILES = Object.freeze([
  Object.freeze({
    key: TASK_LIFECYCLE_CONTEXT_KEY,
    isolationMode: 'sandbox',
    resetStrategy: 'recreate',
    parallelSafety: 'worker-safe',
    footprints: Object.freeze(['filesystem', 'cli', 'workspace-lifecycle']),
    resourceDemand: Object.freeze({ workspaceIo: 1 }),
  }),
]);

export const TEST_CONTEXT_KEYS = Object.freeze(TEST_CONTEXT_PROFILES.map((profile) => profile.key));

export function testContextProfileByKey(key) {
  return TEST_CONTEXT_PROFILES.find((profile) => profile.key === key) ?? null;
}
