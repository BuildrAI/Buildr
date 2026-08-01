import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assertPreviewStopOwner, previewDataRoot, readPreviewOwner, stopPreview } from '../../src/interfaces/local-app/runtime/preview-manager.mjs';

const owner = {
  schemaVersion: 'buildr.local-app-preview/v1', instance: 'demo', identityMode: 'task-environment-v2',
  taskId: 'task-a', workspaceRoot: '/tmp/workspace', environmentRoot: '/tmp/task-a', controllerIdentity: 'sha256-controller', resourceId: 'preview:demo', worktree: '/tmp/task-a',
};

test('task preview stop accepts only exact environment owner and receipt', () => {
  const exact = { taskId: 'task-a', workspaceRoot: '/tmp/workspace', environmentRoot: '/tmp/task-a', controllerIdentity: 'sha256-controller', resourceId: 'preview:demo' };
  assert.doesNotThrow(() => assertPreviewStopOwner(owner, exact));
  for (const caller of [
    { ...exact, taskId: 'task-b' },
    { ...exact, workspaceRoot: '/tmp/other-workspace' },
    { ...exact, environmentRoot: '/tmp/task-b' },
    { ...exact, controllerIdentity: 'stale' },
    { ...exact, resourceId: 'preview:other' },
  ]) assert.throws(() => assertPreviewStopOwner(owner, caller), (error) => error.code === 'preview_stop_owner_mismatch');
});

test('Task preview 可在进程停止后暂留 owner，等待 Environment Receipt 资源释放成功', async (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-owner-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const root = previewDataRoot(owner.instance, dataRoot);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'preview.json'), `${JSON.stringify(owner, null, 2)}\n`);
  const caller = { taskId: owner.taskId, workspaceRoot: owner.workspaceRoot, environmentRoot: owner.environmentRoot, controllerIdentity: owner.controllerIdentity, resourceId: owner.resourceId };

  const stopped = await stopPreview(owner.instance, { dataRoot, caller, retainOwner: true });
  assert.equal(stopped.status, 'stale_cleaned');
  assert.equal(readPreviewOwner(owner.instance, dataRoot)?.taskId, owner.taskId);

  await stopPreview(owner.instance, { dataRoot, caller });
  assert.equal(readPreviewOwner(owner.instance, dataRoot), null);
});
