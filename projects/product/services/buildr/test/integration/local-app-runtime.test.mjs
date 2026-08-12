import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openDefaultBrowser, readLauncherIdentityFromEnvironment } from '../../src/interfaces/local-app/runtime/instance-manager.mjs';
import { pickWorkspaceDirectory } from '../../src/interfaces/local-app/runtime/directory-picker.mjs';

function opener(platform) {
  const calls = [];
  const spawnProcess = (command, args, options) => {
    calls.push({ command, args, options });
    return { unref() {} };
  };
  return { result: openDefaultBrowser('http://127.0.0.1:4321', { platform, spawnProcess }), calls };
}

test('默认浏览器 opener 为 macOS、Windows 和 Linux 生成平台命令', () => {
  assert.deepEqual(opener('darwin').result, { command: 'open', args: ['http://127.0.0.1:4321'] });
  assert.deepEqual(opener('win32').result, { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', 'http://127.0.0.1:4321'] });
  assert.deepEqual(opener('linux').result, { command: 'xdg-open', args: ['http://127.0.0.1:4321'] });
});

test('launcher identity 只接受受支持 schema 与 protocol', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'identity.json');
  fs.writeFileSync(file, '{"schemaVersion":"buildr.launcher-identity/v1","protocolVersion":1,"channel":"development"}\n');
  assert.equal(readLauncherIdentityFromEnvironment({ BUILDR_LAUNCHER_IDENTITY: file }).channel, 'development');
  fs.writeFileSync(file, '{"schemaVersion":"unknown","protocolVersion":1}\n');
  assert.equal(readLauncherIdentityFromEnvironment({ BUILDR_LAUNCHER_IDENTITY: file }), null);
});

test('Workspace 目录选择器复用 macOS 与 Windows 系统对话框', () => {
  const calls = [];
  const execute = (command, args) => {
    calls.push({ command, args });
    return command === 'osascript' ? '/Users/demo/Workspace/\n' : 'C:\\Work\\Buildr\r\n';
  };
  assert.equal(pickWorkspaceDirectory({ platform: 'darwin', execute }), '/Users/demo/Workspace/');
  assert.equal(pickWorkspaceDirectory({ platform: 'win32', execute }), 'C:\\Work\\Buildr');
  assert.equal(calls[0].command, 'osascript');
  assert.equal(calls[1].command, 'powershell.exe');
  assert.throws(() => pickWorkspaceDirectory({ platform: 'linux', execute }), (error) => error.code === 'workspace_picker_unsupported');
});
