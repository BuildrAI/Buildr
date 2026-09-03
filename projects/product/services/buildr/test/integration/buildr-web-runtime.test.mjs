import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { ensureRegisteredTarget } from '../../src/workspace/module.mjs';
import { registerWebInstanceLifecycle } from '../../src/web/application/instance-lifecycle.ts';
import { assertCurrentNpmLauncherBinding, readCurrentProductIdentity } from '../../src/system/installation/module.mjs';
import {
  clearBuildrWebInstance,
  buildrWebInstancePath,
  buildrWebStartLockPath,
  openDefaultBrowser,
  readLauncherIdentityFromEnvironment,
  readBuildrWebInstance,
  writeBuildrWebInstance,
} from '../../src/web/infrastructure/instance-runtime.ts';
import { pickWorkspaceDirectory } from '../../src/web/infrastructure/directory-picker.ts';
import { resolveWebProfile } from '../../src/system/installation/contracts/web-profile.mjs';

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

test('released与development instance receipt和start lock绑定各自Web profile', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-profiles-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const released = resolveWebProfile({ channel: 'npm', runtime: { role: 'host' } }, { dataRoot: path.join(base, 'released') });
  const development = resolveWebProfile({ channel: 'development', runtime: { role: 'development' } }, { dataRoot: path.join(base, 'development') });
  const runtime = { atomicWriteJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); } };
  const state = { url: 'http://127.0.0.1:4321', secret: 'secret', pid: 1234, webProfile: development };
  writeBuildrWebInstance(runtime, state);
  assert.equal(buildrWebInstancePath(released), path.join(base, 'released', 'instance.json'));
  assert.equal(buildrWebInstancePath(development), path.join(base, 'development', 'instance.json'));
  assert.equal(buildrWebStartLockPath(released), path.join(base, 'released', 'instance-start.lock'));
  assert.equal(readBuildrWebInstance(released), null);
  assert.equal(readBuildrWebInstance(development).webProfile.identity, development.identity);
  assert.equal(clearBuildrWebInstance(state, development), true);
  assert.equal(fs.existsSync(buildrWebInstancePath(development)), false);
});

test('正式Web与Task Preview生命周期均不创建后台maintenance scheduler', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-local-app-maintenance-boundary-'));
  const previousDataRoot = process.env.BUILDR_APP_DATA_DIR;
  const previousPreview = process.env.BUILDR_LOCAL_APP_PREVIEW;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  delete process.env.BUILDR_LOCAL_APP_PREVIEW;
  t.after(() => {
    if (previousDataRoot === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousDataRoot;
    if (previousPreview === undefined) delete process.env.BUILDR_LOCAL_APP_PREVIEW;
    else process.env.BUILDR_LOCAL_APP_PREVIEW = previousPreview;
    fs.rmSync(base, { recursive: true, force: true });
  });

  const formalRuntime = createRuntime();
  registerWebInstanceLifecycle(formalRuntime, {
    readProductIdentity: readCurrentProductIdentity,
    assertNpmLauncherBinding: assertCurrentNpmLauncherBinding,
    createLocalWorkspaceServer,
    ensureRegisteredTarget,
  });
  const formal = await formalRuntime.startBuildrWeb(['--port', '0', '--no-open']);
  await new Promise((resolve) => formal.server.close(resolve));

  process.env.BUILDR_LOCAL_APP_PREVIEW = JSON.stringify({
    schemaVersion: 'buildr.local-app-preview/v1',
    instance: 'test-preview',
    worktree: process.cwd(),
  });
  const previewRuntime = createRuntime();
  registerWebInstanceLifecycle(previewRuntime, {
    readProductIdentity: readCurrentProductIdentity,
    assertNpmLauncherBinding: assertCurrentNpmLauncherBinding,
    createLocalWorkspaceServer,
    ensureRegisteredTarget,
  });
  const preview = await previewRuntime.startBuildrWeb(['--port', '0', '--no-open']);
  await new Promise((resolve) => preview.server.close(resolve));
});
