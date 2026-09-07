import { contextTest } from '../../test-context.mjs';
import {
  BUILDR_APPLICATION_TEST_CONTEXTS,
  BUILDR_APPLICATION_WORKSPACE_TEST_CONTEXTS,
} from './providers/task-application.ts';

export { BUILDR_APPLICATION_TEST_CONTEXTS, BUILDR_APPLICATION_WORKSPACE_TEST_CONTEXTS };

export function createBuildrContextTest(options: any = {}): any  {
  const suiteId: any = options.suiteId ?? 'buildr-context-test';
  const contexts: any = options.contexts ?? BUILDR_APPLICATION_TEST_CONTEXTS;
  const select: any = options.select ?? (() => true);
  let registration: any = 0;
  return function buildrContextTest(name: any, testOptions: any, callback: any): any  {
    const currentIndex: any = registration;
    registration += 1;
    if (!select(currentIndex, name)) return undefined;
    const nodeOptions: any = callback === undefined ? {} : testOptions;
    const testCallback: any = callback === undefined ? testOptions : callback;
    return contextTest(name, {
      ...nodeOptions,
      suiteId,
      contexts,
    }, async (t: any, values: any, control: any) => {
      Object.defineProperty(t, 'buildrContexts', { value: values, enumerable: false });
      Object.defineProperty(t, 'buildrContextControl', { value: control, enumerable: false });
      return testCallback(t);
    });
  };
}

export function createBuildrApplicationTest(suiteId: any): any  {
  return createBuildrContextTest({ suiteId, contexts: BUILDR_APPLICATION_TEST_CONTEXTS });
}

export function createBuildrApplicationWorkspaceTest(suiteId: any): any  {
  return createBuildrContextTest({ suiteId, contexts: BUILDR_APPLICATION_WORKSPACE_TEST_CONTEXTS });
}
