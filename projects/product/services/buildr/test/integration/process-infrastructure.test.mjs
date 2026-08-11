import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildCommandInvocation, findExecutableOnPath } from '../../src/infrastructure/process.mjs';

test('共享进程基础层保留参数并只为 Windows command shim 启用 shell', () => {
  const args = ['--version'];
  const shim = buildCommandInvocation('C:\\tools\\openspec.cmd', args, { platform: 'win32' });
  assert.deepEqual(shim, { executable: 'C:\\tools\\openspec.cmd', args: ['--version'], shell: true });
  args.push('--extra');
  assert.deepEqual(shim.args, ['--version']);
  assert.equal(buildCommandInvocation('C:\\tools\\openspec.exe', [], { platform: 'win32' }).shell, false);
  assert.equal(buildCommandInvocation('/usr/local/bin/openspec', [], { platform: 'darwin' }).shell, false);
});

test('共享 PATH 解析器在 Windows 语义下解析 PATHEXT shim', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-process-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'openspec.CMD');
  fs.writeFileSync(executable, '@echo off\n');
  fs.chmodSync(executable, 0o755);
  assert.equal(findExecutableOnPath('openspec', {
    platform: 'win32',
    env: { PATH: root, PATHEXT: '.EXE;.CMD;.BAT' },
  }), executable);
});
