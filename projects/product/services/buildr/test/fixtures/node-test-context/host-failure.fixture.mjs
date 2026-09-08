import assert from 'node:assert/strict';

import { contextTest } from '@buildr-ai/buildr/test-context';
import { sharedMemoryContext } from './shared-context.mjs';

contextTest('host failure remains visible', { contexts: { application: sharedMemoryContext } }, async () => {
  assert.fail('intentional host fixture failure');
});
