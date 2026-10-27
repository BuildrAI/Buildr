import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { defaultWorkspaceRoot } from '../../src/modules/agent-service/infrastructure/default-workspace.ts';

test('normal application profiles share a stable work product directory', () => {
  for (const dataRoot of ['/app/released', '/app/development']) {
    assert.equal(defaultWorkspaceRoot({ dataRoot }, { home: '/users/demo', env: {} }), path.resolve('/users/demo/.buildr/default-workspace'));
  }
});

test('shared product root override retains the explicit workspace name', () => {
  assert.equal(defaultWorkspaceRoot({ dataRoot: '/app' }, { env: { BUILDR_PRODUCT_DATA_DIR: '/shared/product' } }), path.resolve('/shared/product/default-workspace'));
});

test('preview and test application isolation never uses the shared work products', () => {
  const env = { BUILDR_PRODUCT_DATA_DIR: '/shared/product' };
  assert.equal(defaultWorkspaceRoot({ dataRoot: '/preview', overridden: true }, { env }), path.resolve('/preview/default-workspace'));
  assert.equal(defaultWorkspaceRoot({ dataRoot: '/test' }, { env: { ...env, BUILDR_APP_DATA_DIR: '/test' } }), path.resolve('/test/default-workspace'));
});
