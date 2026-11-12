import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';

import { previewDataRoot, pruneOrphanPreviews } from '../../src/web/application/preview-lifecycle.ts';

test('prune 仅清理无主且无存活进程的孤儿目录，逐项报告并失败关闭', { timeout: 20_000 }, async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-prune-')));
  const dataRoot = path.join(root, 'app-data');
  const outside = path.join(root, 'host-cache');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  const dir = (name: string) => { const directory = previewDataRoot(name, dataRoot); fs.mkdirSync(directory, { recursive: true }); return directory; };
  const locked = path.join(previewDataRoot('orphan-fail', dataRoot), 'locked');
  t.after(() => {
    if (fs.existsSync(locked)) fs.chmodSync(locked, 0o755);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const orphan = dir('orphan');
  fs.writeFileSync(path.join(orphan, 'session.json'), '{}');
  fs.mkdirSync(path.join(orphan, 'toolchains', 'cache-targets'), { recursive: true });
  fs.symlinkSync(outside, path.join(orphan, 'toolchains', 'cache-targets', 'npm'));
  fs.symlinkSync(path.join(outside, 'missing'), path.join(orphan, 'broken'));

  const owned = dir('owned');
  fs.writeFileSync(path.join(owned, 'preview.json'), '{"schemaVersion":"buildr.local-app-preview/v1"}');
  const live = dir('live');
  fs.writeFileSync(path.join(live, 'instance.json'), JSON.stringify({ schemaVersion: 'buildr.local-app-instance/v1', url: 'http://127.0.0.1:1', secret: 'x', pid: process.pid }));
  const agentLive = dir('agent-live');
  fs.mkdirSync(path.join(agentLive, 'agent-service', 'process'), { recursive: true });
  fs.writeFileSync(path.join(agentLive, 'agent-service', 'process', 'instance.json'), JSON.stringify({ pid: process.pid }));
  const corrupt = dir('corrupt');
  fs.writeFileSync(path.join(corrupt, 'instance.json'), 'not json');
  const agentCorrupt = dir('agent-corrupt');
  fs.mkdirSync(path.join(agentCorrupt, 'agent-service', 'process'), { recursive: true });
  fs.writeFileSync(path.join(agentCorrupt, 'agent-service', 'process', 'instance.json'), '{}');
  const child = spawn(process.execPath, ['-e', 'process.exit(0)']);
  await new Promise((resolve) => child.once('exit', resolve));
  const dead = dir('dead');
  fs.writeFileSync(path.join(dead, 'instance.json'), JSON.stringify({ schemaVersion: 'buildr.local-app-instance/v1', url: 'http://127.0.0.1:1', secret: 'x', pid: child.pid }));
  const fail = dir('orphan-fail');
  fs.mkdirSync(locked);
  fs.writeFileSync(path.join(locked, 'x'), 'x');
  fs.chmodSync(locked, 0o000);

  const result = pruneOrphanPreviews({ dataRoot });
  const byName = Object.fromEntries(result.results.map((entry) => [entry.instance, entry]));
  assert.equal(byName.orphan.status, 'pruned');
  assert.equal(fs.existsSync(orphan), false);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
  assert.equal(byName.dead.status, 'pruned');
  assert.equal(fs.existsSync(dead), false);
  for (const name of ['owned', 'live', 'agent-live', 'corrupt', 'agent-corrupt']) {
    assert.equal(byName[name].status, 'skipped', name);
    assert.ok(byName[name].reason, name);
    assert.equal(fs.existsSync(previewDataRoot(name, dataRoot)), true, name);
  }
  assert.equal(byName['orphan-fail'].status, 'skipped');
  assert.ok(byName['orphan-fail'].reason);
  assert.equal(fs.existsSync(fail), true);

  const again = pruneOrphanPreviews({ dataRoot });
  assert.equal(again.results.filter((entry) => entry.status === 'pruned').length, 0);
});

test('prune 对不存在的预览根返回空结果', () => {
  const missing = path.join(os.tmpdir(), 'buildr-preview-prune-missing-' + process.pid);
  assert.deepEqual(pruneOrphanPreviews({ dataRoot: missing }), { schemaVersion: 'buildr.local-app-preview/v1', results: [] });
});