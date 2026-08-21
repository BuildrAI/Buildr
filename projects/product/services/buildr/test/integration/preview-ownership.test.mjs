import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assertPreviewStopOwner, previewDataRoot, readPreviewOwner, stopPreview } from '../../src/web/application/preview-lifecycle.mjs';

const head = 'a'.repeat(40);
const owner = {
  schemaVersion: 'buildr.local-app-preview/v1', instance: 'demo', identityMode: 'task-environment-v2',
  taskId: 'task-a', workspaceRoot: '/tmp/workspace', environmentRoot: '/tmp/task-a', resourceId: 'preview:demo', worktree: '/tmp/task-a',
  resourceProvider: 'local-app-preview', resourceHandle: { instance: 'demo' }, resourceProviderIdentity: `demo:1234:${head}`,
  head, managedProcess: { pid: 1234, url: 'http://127.0.0.1:4321', state: 'healthy' },
  controllerIdentity: 'sha256-legacy-compatibility-field',
};

function caller(overrides = {}) {
  return {
    taskId: owner.taskId,
    workspaceRoot: owner.workspaceRoot,
    environmentRoot: owner.environmentRoot,
    resourceId: owner.resourceId,
    resourceProvider: owner.resourceProvider,
    resourceHandle: owner.resourceHandle,
    resourceProviderIdentity: owner.resourceProviderIdentity,
    ...overrides,
  };
}

test('task preview ownership uses Environment/resource/provider facts and ignores legacy controller hash', () => {
  assert.doesNotThrow(() => assertPreviewStopOwner(owner, caller()));
  assert.doesNotThrow(() => assertPreviewStopOwner(owner, caller({ controllerIdentity: 'sha256-different-manager' })));
  for (const mismatched of [
    caller({ taskId: 'task-b' }),
    caller({ workspaceRoot: '/tmp/other-workspace' }),
    caller({ environmentRoot: '/tmp/task-b' }),
    caller({ resourceId: 'preview:other' }),
    caller({ resourceProvider: 'other-provider' }),
    caller({ resourceHandle: { instance: 'other' } }),
    caller({ resourceProviderIdentity: 'other-provider-identity' }),
  ]) assert.throws(() => assertPreviewStopOwner(owner, mismatched), (error) => error.code === 'preview_stop_owner_mismatch');
  const corruptedOwner = { ...owner, resourceProviderIdentity: 'other-provider-identity' };
  assert.throws(() => assertPreviewStopOwner(corruptedOwner, caller({ resourceProviderIdentity: corruptedOwner.resourceProviderIdentity })), (error) => error.code === 'preview_stop_owner_mismatch');
});

test('Task preview 可在进程停止后暂留 owner，等待 Environment Receipt 资源释放成功', async (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-owner-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const root = previewDataRoot(owner.instance, dataRoot);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'preview.json'), `${JSON.stringify(owner, null, 2)}\n`);

  const stopped = await stopPreview(owner.instance, { dataRoot, caller: caller(), retainOwner: true });
  assert.equal(stopped.status, 'stale_cleaned');
  assert.equal(readPreviewOwner(owner.instance, dataRoot)?.taskId, owner.taskId);

  await stopPreview(owner.instance, { dataRoot, caller: caller() });
  assert.equal(readPreviewOwner(owner.instance, dataRoot), null);
});
