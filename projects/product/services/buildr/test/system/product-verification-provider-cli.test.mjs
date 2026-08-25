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

test('Product live v3通过高级provider形成affected Task Delivery Plan', () => {
  const targetIdentity = 'target:product-provider-cli';
  const planned = run(['verification', 'plan', '--project', 'product', '--target-kind', 'task-delivery', '--selection-scope', 'affected', '--target-identity', targetIdentity, '--changed-path', 'src/verification/domain/verification-plan.mjs', '--target', WORKSPACE_ROOT, '--json']);
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  assert.match(plan.providerIdentity, /^sha256-/u);
  assert.ok(plan.selectedItems.some((item) => item.selection.kind === 'direct'));
  assert.ok(plan.executionUnits.some((unit) => unit.capability === 'product.verification' && unit.invocation.provider === 'buildr.product-verification/v1'));
  assert.ok(plan.selectedItems.every((item) => !item.evidence.includes('legacy-declared')));
});

test('Product live v3把Browser command与高级provider组合到同一Plan', () => {
  const planned = run(['verification', 'plan', '--project', 'product', '--target-kind', 'task-delivery', '--selection-scope', 'affected', '--target-identity', 'target:product-browser-provider-cli', '--changed-path', 'services/buildr-web/src/App.tsx', '--target', WORKSPACE_ROOT, '--json']);
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  assert.ok(plan.executionUnits.some((unit) => unit.capability === 'product.verification' && unit.invocation.kind === 'provider'));
  const browser = plan.executionUnits.find((unit) => unit.capability === 'product.browser-smoke');
  assert.equal(browser?.scope, 'affected');
  assert.deepEqual(browser?.invocation.argv, ['tools/development/run-development-npm', 'run', 'test:browser:changed']);
});
