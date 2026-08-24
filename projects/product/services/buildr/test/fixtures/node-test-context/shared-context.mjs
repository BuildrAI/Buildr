import { defineTestContext } from '../../../test-context.mjs';

const COUNT = Symbol.for('@buildr-ai/test-context/fixture-create-count');

export const sharedMemoryContext = defineTestContext({
  id: 'fixture.memory-application',
  version: 1,
  scope: 'worker',
  parallelSafety: 'shared',
  create() {
    globalThis[COUNT] = (globalThis[COUNT] ?? 0) + 1;
    return Object.freeze({ generation: globalThis[COUNT], pid: process.pid });
  },
});
