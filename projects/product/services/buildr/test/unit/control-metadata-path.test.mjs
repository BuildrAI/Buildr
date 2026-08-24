import assert from 'node:assert/strict';
import test from 'node:test';

import { controlMetadataPath } from '../../src/infrastructure/git/control-metadata-path.mjs';

test('只把 Workspace 根与 OpenSpec Change 的 .buildr 识别为控制元数据', () => {
  assert.equal(controlMetadataPath('.buildr/local/workspace.sqlite'), true);
  assert.equal(controlMetadataPath('projects/product/openspec/changes/demo/.buildr/convergence-receipt.json'), true);
  assert.equal(controlMetadataPath('projects/product/openspec/changes/archive/demo/.buildr/convergence-receipt.json'), true);
  assert.equal(controlMetadataPath('projects/product/services/buildr/resources/workspace/.buildr/workspace.yml'), false);
  assert.equal(controlMetadataPath('docs/.buildr/example.yml'), false);
  assert.equal(controlMetadataPath('nested/.git/config'), true);
});
