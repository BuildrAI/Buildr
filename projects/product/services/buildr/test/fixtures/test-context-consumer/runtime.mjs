import assert from 'node:assert/strict';

import { createTestContextRuntime, defineTestContext } from '@buildr-ai/buildr/test-context';

const memory = defineTestContext({
  id: 'consumer.memory',
  version: 1,
  scope: 'worker',
  parallelSafety: 'isolated',
  create() {
    return { acquired: 0 };
  },
  acquire({ state }) {
    state.acquired += 1;
    return { acquired: state.acquired };
  },
});

const runtime = createTestContextRuntime();
const first = await runtime.acquire({ memory }, { testId: 'first' });
assert.equal(first.values.memory.acquired, 1);
await first.release({ outcome: 'passed' });
const second = await runtime.acquire({ memory }, { testId: 'second' });
assert.equal(second.values.memory.acquired, 2);
await second.release({ outcome: 'passed' });
assert.equal(runtime.events().filter((event) => event.operation === 'create').length, 1);
assert.equal(runtime.events().filter((event) => event.operation === 'cache-hit').length, 1);
await runtime.close();
