import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKSPACE_SCHEMA_V1,
  parseWorkspaceManifest,
  renderWorkspaceManifest,
  workspaceManifestRevision,
} from '../../src/infrastructure/filesystem/workspace-manifest-repository.mjs';

const WORKSPACE_ID = 'f2f40b71-2382-5906-82bd-76a7927b59f3';

test('canonical Workspace Manifest 使用封闭 schema 并保留兼容 metadata', () => {
  const content = renderWorkspaceManifest({
    workspace: { id: WORKSPACE_ID, name: 'Buildr', description: 'Product workspace', runtime: { node: { version: '24.15.0' } } },
    compatibility: { kind: 'organization', profile: 'team' },
  });
  const parsed = parseWorkspaceManifest(content);
  assert.equal(parsed.schemaVersion, WORKSPACE_SCHEMA_V1);
  assert.equal(parsed.canonical, true);
  assert.deepEqual(parsed.workspace, { id: WORKSPACE_ID, name: 'Buildr', description: 'Product workspace', runtime: { node: { version: '24.15.0' } } });
  assert.equal(parsed.nodeMigrationRequired, false);
  assert.deepEqual(parsed.compatibility, { kind: 'organization', profile: 'team' });
  assert.match(workspaceManifestRevision(content), /^sha256-[0-9a-f]{64}$/);
  assert.throws(() => parseWorkspaceManifest(`${content}unknown: true\n`), /unknown is not a supported/);
});

test('legacy Workspace Manifest 兼容有版本与无版本输入且明确要求迁移', () => {
  for (const content of [
    'schemaVersion: 1\nkind: organization\nname: Buildr\nprofile: team\n',
    'kind: organization\nname: Buildr\nprofile: team\n',
  ]) {
    const parsed = parseWorkspaceManifest(content);
    assert.equal(parsed.canonical, false);
    assert.equal(parsed.migrationRequired, true);
    assert.deepEqual(parsed.workspace, { id: null, name: 'Buildr', description: '' });
    assert.equal(parsed.nodeMigrationRequired, true);
  }
});

test('canonical Workspace Manifest 缺少 Node 声明时要求迁移并拒绝模糊或不兼容版本', () => {
  const missing = parseWorkspaceManifest(`schemaVersion: buildr.workspace/v1\nid: ${WORKSPACE_ID}\nname: Buildr\ndescription: Product\n`);
  assert.equal(missing.canonical, true);
  assert.equal(missing.nodeMigrationRequired, true);
  for (const version of ['24', '24.x', 'v24.15', '24.14.0', '18.20.0']) {
    assert.throws(() => parseWorkspaceManifest(`schemaVersion: buildr.workspace/v1\nid: ${WORKSPACE_ID}\nname: Buildr\ndescription: Product\nruntime:\n  node:\n    version: ${version}\n`), /runtime\.node\.version/);
  }
});
