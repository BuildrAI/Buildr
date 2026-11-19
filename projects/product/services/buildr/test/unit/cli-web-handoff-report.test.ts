import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { reportWebHandoffStartupFailure, WEB_HANDOFF_FAILURE_FILE_ENV } from '../../src/bootstrap/cli/main.ts';

test('交接失败只向私有通道上报一次，并保留错误码与有界消息', async () => {
  const messages: any[] = [];
  const send = (message: any, callback: () => void) => { messages.push(message); callback(); };
  const argv = ['node', 'buildr.mjs', 'web', '--restart', 'sha256-' + 'a'.repeat(64), '--no-open', '--port', '4458'];
  const failure = Object.assign(new Error('交接无法确认旧实例健康。'), { code: 'web_update_instance_unconfirmed' });
  assert.equal(await reportWebHandoffStartupFailure(failure, argv, send), true);
  assert.deepEqual(messages, [{ type: 'buildr.web-update-handoff-failed', code: 'web_update_instance_unconfirmed', message: '交接无法确认旧实例健康。' }]);
  assert.equal(await reportWebHandoffStartupFailure(failure, argv, send), false, '同一失败不重复上报');
  assert.equal(messages.length, 1);
});

test('非交接参数与无通道环境不上报', async () => {
  const messages: any[] = [];
  const send = (message: any, callback: () => void) => { messages.push(message); callback(); };
  assert.equal(await reportWebHandoffStartupFailure(new Error('普通 CLI 失败'), ['node', 'buildr.mjs', 'task', 'list'], send), false);
  assert.equal(messages.length, 0);
  const argv = ['node', 'buildr.mjs', 'web', '--update-handoff', 'sha256-' + 'b'.repeat(64), '--no-open', '--port', '4458'];
  assert.equal(await reportWebHandoffStartupFailure(new Error('bootstrap 失败'), argv), false, '测试进程没有 IPC 通道，不上报');
});

test('没有错误码时使用统一的进程失败码', async () => {
  const messages: any[] = [];
  const send = (message: any, callback: () => void) => { messages.push(message); callback(); };
  const argv = ['node', 'buildr.mjs', 'web', '--update-handoff', 'sha256-' + 'c'.repeat(64), '--no-open', '--port', '4458'];
  assert.equal(await reportWebHandoffStartupFailure(new Error('ENOENT: package resources'), argv, send), true);
  assert.equal(messages[0].code, 'web_update_process_failed');
});

test('无 IPC 通道时通过 BUILDR_WEB_HANDOFF_FAILURE_FILE 原子写入交接失败诊断', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-handoff-diag-'));
  const previousEnv = process.env[WEB_HANDOFF_FAILURE_FILE_ENV];
  t.after(() => {
    if (previousEnv === undefined) delete process.env[WEB_HANDOFF_FAILURE_FILE_ENV];
    else process.env[WEB_HANDOFF_FAILURE_FILE_ENV] = previousEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const failureFile = path.join(dir, 'nested', 'handoff-failure.json');
  process.env[WEB_HANDOFF_FAILURE_FILE_ENV] = failureFile;
  const argv = ['node', 'buildr.mjs', 'web', '--update-handoff', 'sha256-' + 'd'.repeat(64), '--no-open', '--port', '4458'];
  const failure = Object.assign(new Error('port conflict'), { code: 'web_handoff_port_conflict' });
  assert.equal(await reportWebHandoffStartupFailure(failure, argv), true);
  assert.equal(fs.existsSync(failureFile), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(failureFile, 'utf8')), {
    type: 'buildr.web-update-handoff-failed',
    code: 'web_handoff_port_conflict',
    message: 'port conflict',
  });
  const mode = fs.statSync(failureFile).mode & 0o777;
  assert.equal(mode, 0o600);
});
