import { contextTest } from '../../test-context.mjs';
import {
  BUILDR_APPLICATION_TEST_CONTEXTS,
  BUILDR_APPLICATION_WORKSPACE_TEST_CONTEXTS,
} from './providers/task-application.mjs';

export { BUILDR_APPLICATION_TEST_CONTEXTS, BUILDR_APPLICATION_WORKSPACE_TEST_CONTEXTS };

export function createBuildrContextTest(options = {}) {
  const suiteId = options.suiteId ?? 'buildr-context-test';
  const contexts = options.contexts ?? BUILDR_APPLICATION_TEST_CONTEXTS;
  const select = options.select ?? (() => true);
  let registration = 0;
  return function buildrContextTest(name, testOptions, callback) {
    const currentIndex = registration;
    registration += 1;
    if (!select(currentIndex, name)) return undefined;
    const nodeOptions = callback === undefined ? {} : testOptions;
    const testCallback = callback === undefined ? testOptions : callback;
    return contextTest(name, {
      ...nodeOptions,
      suiteId,
      contexts,
    }, async (t, values, control) => {
      Object.defineProperty(t, 'buildrContexts', { value: values, enumerable: false });
      Object.defineProperty(t, 'buildrContextControl', { value: control, enumerable: false });
      return testCallback(t);
    });
  };
}

export function createBuildrApplicationTest(suiteId) {
  return createBuildrContextTest({ suiteId, contexts: BUILDR_APPLICATION_TEST_CONTEXTS });
}

export function createBuildrApplicationWorkspaceTest(suiteId) {
  return createBuildrContextTest({ suiteId, contexts: BUILDR_APPLICATION_WORKSPACE_TEST_CONTEXTS });
}
