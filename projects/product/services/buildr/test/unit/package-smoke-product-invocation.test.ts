import assert from 'node:assert/strict';
import test from 'node:test';

import { createBuildrSelfInvoker } from '../../src/agent-assets/application/package-maintenance/smoke-checks.ts';
import { productInvocationArgs } from '../../src/infrastructure/product-invocation/index.ts';

function exerciseInvocation(invocation: any): any  {
  const calls: any[] = [];
  let resolutions: any = 0;
  const invoker: any = createBuildrSelfInvoker({
    currentProductInvocation: () => {
      resolutions += 1;
      return invocation;
    },
    productInvocationArgs,
    execFileSync: (command: any, args: any, options: any) => {
      calls.push({ runner: 'exec', command, args, options });
      return 'exec-output';
    },
    spawnSync: (command: any, args: any, options: any) => {
      calls.push({ runner: 'spawn', command, args, options });
      return { status: 0 };
    },
  });

  assert.equal(resolutions, 0);
  assert.equal(invoker.exec(['doctor', '--json'], { encoding: 'utf8' }), 'exec-output');
  assert.deepEqual(invoker.spawn(['rules', 'add', 'demo'], { encoding: 'utf8' }), { status: 0 });
  return { calls, resolutions };
}

test('package smoke recursive CLI calls preserve the current installation-channel invocation', () => {
  const host: any = exerciseInvocation({ command: '/product/node', argsPrefix: ['/product/bin/buildr.mjs'], kind: 'host-node' });
  assert.equal(host.resolutions, 1);
  assert.deepEqual(host.calls.map(({ runner, command, args }: any) => ({ runner, command, args })), [
    { runner: 'exec', command: '/product/node', args: ['/product/bin/buildr.mjs', 'doctor', '--json'] },
    { runner: 'spawn', command: '/product/node', args: ['/product/bin/buildr.mjs', 'rules', 'add', 'demo'] },
  ]);
});
