import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedProductLayerImport, productLayerOf } from '../verification/cli/product-layer-boundaries.ts';

test('任务子领域按明确登记识别各层，未登记目录保持关闭', () => {
  const root = 'modules/task/work-context/';
  for (const [directory, layer] of [['domain', 'domain'], ['application', 'application'], ['persistence', 'infrastructure'], ['interfaces/http', 'interfaces'], ['interfaces/cli', 'interfaces']]) assert.equal(productLayerOf(`${root}${directory}/value.ts`), layer);
  assert.equal(productLayerOf('modules/task/unknown/application/value.ts'), 'modules');
  assert.equal(isAllowedProductLayerImport('modules/task/module.ts', `${root}application/value.ts`), true);
  assert.equal(isAllowedProductLayerImport(`${root}application/value.ts`, `${root}persistence/value.ts`), true);
  assert.equal(isAllowedProductLayerImport(`${root}persistence/value.ts`, 'infrastructure/sqlite/transaction.ts'), true);
  assert.equal(isAllowedProductLayerImport('modules/task/module.ts', 'modules/task/unknown/application/value.ts'), false);
});

test('新增工作台没有放宽领域或应用的反向依赖，模块端口只登记实际组合边界', () => {
  assert.equal(isAllowedProductLayerImport('modules/task/work-context/domain/value.ts', 'infrastructure/contracts/json-schema-validator.ts'), false);
  assert.equal(isAllowedProductLayerImport('modules/workbench/application/value.ts', 'modules/workbench/interfaces/http/value.ts'), false);
  assert.equal(isAllowedProductLayerImport('modules/workbench/application/value.ts', 'modules/workbench/domain/value.ts'), true);
  assert.equal(isAllowedProductLayerImport('modules/workbench/module.ts', 'modules/task/module.ts'), true);
  assert.equal(isAllowedProductLayerImport('modules/workbench/module.ts', 'modules/workspace/module.ts'), true);
  assert.equal(isAllowedProductLayerImport('modules/workbench/module.ts', 'modules/installation/module.ts'), false);
});
