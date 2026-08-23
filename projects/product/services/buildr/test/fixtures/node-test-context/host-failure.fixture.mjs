import assert from 'node:assert/strict';

import { contextTest } from '../../../src/infrastructure/testing/context-runtime/index.mjs';
import { sharedMemoryContext } from './shared-context.mjs';

contextTest('host failure remains visible', { contexts: { application: sharedMemoryContext } }, async () => {
  assert.fail('intentional host fixture failure');
});

