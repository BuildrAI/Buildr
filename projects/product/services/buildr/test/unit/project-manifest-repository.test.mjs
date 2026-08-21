import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROJECTS_SCHEMA_V1,
  PROJECTS_SCHEMA_V2,
  parseProjectsManifest,
  projectManifestRevision,
  renderProjectsManifest,
} from '../../src/workspace/persistence/project-manifest-repository.mjs';

const PROJECT_ID = 'd15bde2c-9aab-4ed8-bf43-28a5372ca407';
const WORKSPACE_ID = 'f2f40b71-2382-5906-82bd-76a7927b59f3';

test('canonical Project Manifest v2 round trip 使用封闭 Domain schema', () => {
  const content = renderProjectsManifest({
    product: {
      id: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      code: 'product',
      name: 'Buildr 产品',
      description: '产品实现',
      source: { type: 'git', path: 'projects/product', git: { url: 'https://example.com/buildr.git', remote: 'upstream', integrationBranch: 'dev' } },
    },
  });
  const parsed = parseProjectsManifest(content, { workspaceId: WORKSPACE_ID });
  assert.equal(parsed.schemaVersion, PROJECTS_SCHEMA_V2);
  assert.equal(parsed.migrationRequired, false);
  assert.equal(parsed.entities.product.source.git.integrationBranch, 'dev');
  assert.match(projectManifestRevision(content), /^sha256-[0-9a-f]{64}$/);
  assert.throws(() => parseProjectsManifest(content.replace('name: Buildr 产品', 'name: Buildr 产品\n    status: active'), { workspaceId: WORKSPACE_ID }), /status is not a supported/);
  assert.throws(() => parseProjectsManifest(content, { workspaceId: '1690214e-82dd-4726-b0bf-6db8c34e8153' }), /must equal the current Workspace id/);
});

test('v1 Project Manifest 只兼容投影并标记 migration', () => {
  const content = [
    `schemaVersion: ${PROJECTS_SCHEMA_V1}`,
    'projects:',
    '  product:',
    '    title: Buildr 产品',
    '    description: 产品实现',
    '    path: projects/product',
    '    repo:',
    '      kind: git',
    '      url: https://example.com/buildr.git',
    '      remote: origin',
    '      defaultBranch: dev',
    '',
  ].join('\n');
  const parsed = parseProjectsManifest(content, { workspaceId: WORKSPACE_ID });
  assert.equal(parsed.schemaVersion, PROJECTS_SCHEMA_V1);
  assert.equal(parsed.migrationRequired, true);
  assert.equal(parsed.entities.product.id, null);
  assert.equal(parsed.entities.product.workspaceId, WORKSPACE_ID);
  assert.equal(parsed.entities.product.name, 'Buildr 产品');
  assert.equal(parsed.entities.product.source.git.integrationBranch, 'dev');
});

test('v1 compatibility 为低风险缺失字段补迁移投影并允许显式收敛未知字段', () => {
  const content = [
    `schemaVersion: ${PROJECTS_SCHEMA_V1}`,
    'legacyTopLevel: remove-on-migration',
    'projects:',
    '  product:',
    '    legacyField: remove-on-migration',
    '    repo:',
    '      kind: workspace',
    '      legacyRepoField: remove-on-migration',
    '',
  ].join('\n');
  const parsed = parseProjectsManifest(content, { workspaceId: WORKSPACE_ID });
  assert.equal(parsed.migrationRequired, true);
  assert.equal(parsed.entities.product.name, 'product');
  assert.equal(parsed.entities.product.description, 'TODO: 补充 Project product 的用途说明。');
  assert.deepEqual(parsed.entities.product.source, { type: 'workspace', path: 'projects/product' });
});
