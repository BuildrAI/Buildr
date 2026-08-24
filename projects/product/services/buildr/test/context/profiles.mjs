export const TASK_LIFECYCLE_CONTEXT_KEY = 'task-lifecycle/v1';
export const WORKSPACE_FOUNDATION_CONTEXT_KEY = 'workspace-foundation/v1';
export const PROJECT_FOUNDATION_CONTEXT_KEY = 'project-foundation/v1';
export const GIT_REPOSITORY_CONTEXT_KEY = 'git-repository/v1';

export const TEST_CONTEXT_PROFILES = Object.freeze([
  Object.freeze({
    key: WORKSPACE_FOUNDATION_CONTEXT_KEY,
    isolationMode: 'sandbox',
    resetStrategy: 'recreate',
    parallelSafety: 'worker-safe',
    footprints: Object.freeze(['filesystem', 'workspace-lifecycle']),
    resourceDemand: Object.freeze({ workspaceIo: 1 }),
  }),
  Object.freeze({
    key: PROJECT_FOUNDATION_CONTEXT_KEY,
    isolationMode: 'sandbox',
    resetStrategy: 'recreate',
    parallelSafety: 'worker-safe',
    footprints: Object.freeze(['filesystem', 'workspace-lifecycle']),
    resourceDemand: Object.freeze({ workspaceIo: 1 }),
  }),
  Object.freeze({
    key: GIT_REPOSITORY_CONTEXT_KEY,
    isolationMode: 'sandbox',
    resetStrategy: 'recreate',
    parallelSafety: 'worker-safe',
    footprints: Object.freeze(['filesystem', 'git']),
    resourceDemand: Object.freeze({ git: 1, workspaceIo: 1 }),
  }),
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
