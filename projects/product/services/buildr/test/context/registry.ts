import { createTaskLifecycleContextProvider, taskLifecycleContextProvider, TASK_LIFECYCLE_CONTEXT_KEY } from './providers/task-lifecycle.ts';
import {
  createGitRepositoryContextProvider,
  createProjectFoundationContextProvider,
  createWorkspaceFoundationContextProvider,
  gitRepositoryContextProvider,
  projectFoundationContextProvider,
  workspaceFoundationContextProvider,
} from './providers/prepared-fixtures.ts';
import { TEST_CONTEXT_KEYS, TEST_CONTEXT_PROFILES } from './profiles.ts';

export {
  createGitRepositoryContextProvider,
  createProjectFoundationContextProvider,
  createTaskLifecycleContextProvider,
  createWorkspaceFoundationContextProvider,
  TASK_LIFECYCLE_CONTEXT_KEY,
  TEST_CONTEXT_KEYS,
};

export const TEST_CONTEXT_PROVIDERS: any = Object.freeze([
  workspaceFoundationContextProvider,
  projectFoundationContextProvider,
  gitRepositoryContextProvider,
  taskLifecycleContextProvider,
]);

if (TEST_CONTEXT_PROVIDERS.length !== TEST_CONTEXT_KEYS.length
  || TEST_CONTEXT_PROVIDERS.some((provider: any, index: any) => {
    const profile: any = TEST_CONTEXT_PROFILES[index];
    return provider.key !== profile.key
      || provider.isolationMode !== profile.isolationMode
      || provider.resetStrategy !== profile.resetStrategy
      || provider.parallelSafety !== profile.parallelSafety
      || JSON.stringify(provider.footprints ?? []) !== JSON.stringify(profile.footprints);
  })) {
  throw new Error('test_context_registry_profile_mismatch: Context profiles and providers must have the same stable keys.');
}

export function testContextProviderByKey(key: any): any  {
  return TEST_CONTEXT_PROVIDERS.find((provider: any) => provider.key === key) ?? null;
}
