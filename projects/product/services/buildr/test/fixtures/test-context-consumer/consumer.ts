import {
  createTestContextRuntime,
  defineTestContext,
  type TestContextDefinitionInput,
} from '@buildr-ai/buildr/test-context';

interface ConsumerConfig {
  prefix: string;
  [key: string]: string;
}

interface ConsumerState {
  count: number;
  prefix: string;
}

interface ConsumerValue {
  label: string;
  count: number;
}

const input: TestContextDefinitionInput<'consumer.memory', ConsumerState, ConsumerConfig, ConsumerValue, readonly []> = {
  id: 'consumer.memory',
  version: 1,
  scope: 'worker',
  parallelSafety: 'isolated',
  create({ config }) {
    return { count: 0, prefix: config.prefix };
  },
  acquire({ state }) {
    state.count += 1;
    return { label: `${state.prefix}-${state.count}`, count: state.count };
  },
};

const memory = defineTestContext(input);
const runtime = createTestContextRuntime();
const lease = await runtime.acquire({ memory: { definition: memory, config: { prefix: 'typed' } } });

const label: string = lease.values.memory.label;
const count: number = lease.values.memory.count;
void label;
void count;

// @ts-expect-error acquired values keep their public shape.
lease.values.memory.missing;
// @ts-expect-error config must match the definition's Config type.
await runtime.acquire({ memory: { definition: memory, config: { prefix: 42 } } });

await lease.release({ outcome: 'passed' });
await runtime.close();
