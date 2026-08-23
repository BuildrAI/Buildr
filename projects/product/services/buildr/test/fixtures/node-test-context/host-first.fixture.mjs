import assert from 'node:assert/strict';

import { contextTest } from '../../../src/infrastructure/testing/context-runtime/index.mjs';
import { sharedMemoryContext } from './shared-context.mjs';

contextTest('first file receives the host Application Context', { contexts: { application: sharedMemoryContext } }, async (_t, contexts) => {
  assert.equal(contexts.application.generation, 1);
  assert.equal(contexts.application.pid, process.pid);
});

