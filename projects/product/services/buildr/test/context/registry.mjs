import { createTaskLifecycleContextProvider, taskLifecycleContextProvider, TASK_LIFECYCLE_CONTEXT_KEY } from './providers/task-lifecycle.mjs';
import { TEST_CONTEXT_KEYS, TEST_CONTEXT_PROFILES } from './profiles.mjs';

export { createTaskLifecycleContextProvider, TASK_LIFECYCLE_CONTEXT_KEY, TEST_CONTEXT_KEYS };

export const TEST_CONTEXT_PROVIDERS = Object.freeze([taskLifecycleContextProvider]);

if (TEST_CONTEXT_PROVIDERS.length !== TEST_CONTEXT_KEYS.length
  || TEST_CONTEXT_PROVIDERS.some((provider, index) => {
    const profile = TEST_CONTEXT_PROFILES[index];
    return provider.key !== profile.key
      || provider.isolationMode !== profile.isolationMode
      || provider.resetStrategy !== profile.resetStrategy
      || provider.parallelSafety !== profile.parallelSafety
      || JSON.stringify(provider.footprints ?? []) !== JSON.stringify(profile.footprints);
  })) {
  throw new Error('test_context_registry_profile_mismatch: Context profiles and providers must have the same stable keys.');
}

export function testContextProviderByKey(key) {
  return TEST_CONTEXT_PROVIDERS.find((provider) => provider.key === key) ?? null;
}
