import assert from 'node:assert/strict';

import { contextTest } from '@buildr-ai/buildr/test-context';
import { sharedMemoryContext } from './shared-context.mjs';

contextTest('second file reuses the host Application Context', { contexts: { application: sharedMemoryContext } }, async (_t, contexts) => {
  assert.equal(contexts.application.generation, 1);
  assert.equal(contexts.application.pid, process.pid);
});
