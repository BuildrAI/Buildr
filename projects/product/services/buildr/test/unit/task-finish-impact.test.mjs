import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyRetainedConvergencePaths } from '../../src/application/task-finish/task-finish-impact.mjs';

test('Local App 影响范围与 launcher 的完整产品打包清单一致', () => {
  const result = classifyRetainedConvergencePaths([
    'projects/product/services/buildr/src/domain/workspace/workspace.mjs',
    'projects/product/services/buildr/src/interfaces/local-app/web/styles.css',
    'projects/product/services/buildr/package/targets/workspace/AGENTS.md',
    'projects/product/services/buildr/package.json',
    'projects/product/docs/roadmap/README.md',
  ]);

  assert.deepEqual(result.localApp, [
    'services/buildr/package.json',
    'services/buildr/package/targets/workspace/AGENTS.md',
    'services/buildr/src/domain/workspace/workspace.mjs',
    'services/buildr/src/interfaces/local-app/web/styles.css',
  ]);
  assert.equal(result.requiresLocalAppInstall, true);
  assert.equal(result.requiresCliInstall, true);
  assert.equal(result.requiresRuntimeSync, true);
  assert.deepEqual(result.unknown, ['docs/roadmap/README.md']);
});

test('非 launcher 打包内容不会触发 development launcher 更新', () => {
  const result = classifyRetainedConvergencePaths([
    'projects/product/docs/buildr-product.md',
    'projects/product/openspec/specs/local-workspace-application/spec.md',
    'projects/product/services/buildr/test/integration/local-app-runtime.test.mjs',
  ]);

  assert.equal(result.requiresLocalAppInstall, false);
  assert.deepEqual(result.localApp, []);
});
