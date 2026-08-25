import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SERVICE_ROOT = path.resolve(import.meta.dirname, '../..');
const WORKSPACE_ROOT = path.resolve(SERVICE_ROOT, '../../../..');
const BUILDR = path.join(SERVICE_ROOT, 'bin', 'buildr.mjs');

function run(args) {
  return spawnSync(process.execPath, [BUILDR, ...args], { cwd: SERVICE_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

test('Product live v2通过新CLI形成full-only Task Delivery Plan且不冒充provider', () => {
  const targetIdentity = 'target:product-provider-cli';
  const planned = run(['verification', 'plan', '--project', 'product', '--target-kind', 'task-delivery', '--selection-scope', 'affected', '--target-identity', targetIdentity, '--changed-path', 'src/verification/domain/verification-plan.mjs', '--target', WORKSPACE_ROOT, '--json']);
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  assert.equal(plan.providerIdentity, null);
  assert.deepEqual(plan.selectedItems.map((item) => item.id), ['product.delivery']);
  assert.deepEqual(plan.selectedItems[0].evidence, ['legacy-declared']);
  assert.equal(plan.executionUnits[0].scope, 'full');
  assert.equal(plan.executionUnits[0].invocation.provider, undefined);
});
