import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkspace, isWorkspaceId } from '../../src/domain/workspace/workspace.mjs';
import { resolveWorkspaceIdentity } from '../../src/application/workspace/workspace-application.mjs';

const WORKSPACE_ID = 'f2f40b71-2382-5906-82bd-76a7927b59f3';

test('Workspace Domain 使用稳定 UUID、metadata 和精确 Node toolchain', () => {
  const runtime = { node: { version: '22.4.1' } };
  const workspace = createWorkspace({ id: WORKSPACE_ID, name: ' Buildr ', description: ' Product workspace ', runtime });
  assert.deepEqual(workspace, { id: WORKSPACE_ID, name: 'Buildr', description: 'Product workspace', runtime });
  assert.equal(isWorkspaceId(workspace.id), true);
  assert.throws(() => createWorkspace({ id: 'workspace', name: 'Buildr', description: 'Description', runtime }), /must be a UUID/);
  assert.throws(() => createWorkspace({ id: WORKSPACE_ID, name: '', description: 'Description', runtime }), /name must be a non-empty string/);
});

test('Workspace identity 复用已有 UUID、按需生成并拒绝冲突', () => {
  const generated = '6c2d67c4-399f-4b54-9171-8ea3512ef394';
  assert.equal(resolveWorkspaceIdentity(null, WORKSPACE_ID), WORKSPACE_ID);
  assert.equal(resolveWorkspaceIdentity(WORKSPACE_ID, WORKSPACE_ID), WORKSPACE_ID);
  assert.equal(resolveWorkspaceIdentity(null, null, () => generated), generated);
  assert.throws(() => resolveWorkspaceIdentity(WORKSPACE_ID, '7cf5b7af-38cc-5cb4-86f7-6a45a45e9012'), /identity 冲突/);
  assert.throws(() => resolveWorkspaceIdentity(null, 'buildr-product-baseline'), /必须是 UUID/);
});
