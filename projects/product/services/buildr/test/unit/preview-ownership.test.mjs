import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { assertPreviewStopOwner } from '../../src/interfaces/local-app/runtime/preview-manager.mjs';
import { taskRuntimeBlockers } from '../../src/application/worktree/worktree-application.mjs';

const owner = {
  schemaVersion: 'buildr.local-app-preview/v1', instance: 'demo', identityMode: 'task-environment',
  taskId: 'task-a', owner: 'codex', environmentRoot: '/tmp/task-a', receiptIdentity: 'sha256-receipt', worktree: '/tmp/task-a',
};

test('task preview stop accepts only exact environment owner and receipt', () => {
  assert.doesNotThrow(() => assertPreviewStopOwner(owner, { taskId: 'task-a', owner: 'codex', environmentRoot: '/tmp/task-a', receiptIdentity: 'sha256-receipt' }));
  for (const caller of [
    { taskId: 'task-b', owner: 'codex', environmentRoot: '/tmp/task-a', receiptIdentity: 'sha256-receipt' },
    { taskId: 'task-a', owner: 'other', environmentRoot: '/tmp/task-a', receiptIdentity: 'sha256-receipt' },
    { taskId: 'task-a', owner: 'codex', environmentRoot: '/tmp/task-b', receiptIdentity: 'sha256-receipt' },
    { taskId: 'task-a', owner: 'codex', environmentRoot: '/tmp/task-a', receiptIdentity: 'stale' },
  ]) assert.throws(() => assertPreviewStopOwner(owner, caller), (error) => error.code === 'preview_stop_owner_mismatch');
});

test('worktree runtime preflight detects retained task preview ownership', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-preflight-'));
  const appData = path.join(root, 'app-data');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previous = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = appData;
  t.after(() => { if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previous; });
  execFileSync('git', ['init', '-q', root]);
  const previewRoot = path.join(appData, 'previews', 'task-a-preview');
  fs.mkdirSync(previewRoot, { recursive: true });
  fs.writeFileSync(path.join(previewRoot, 'preview.json'), `${JSON.stringify({ ...owner, instance: 'task-a-preview', environmentRoot: root, worktree: root })}\n`);
  const blockers = taskRuntimeBlockers(root, { taskId: 'task-a', environmentRoot: root });
  assert.deepEqual(blockers, [{ kind: 'preview', id: 'task-a-preview', pid: null, state: 'ownership-record-retained' }]);
});
