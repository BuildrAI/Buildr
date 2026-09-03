import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  buildCommandInvocation,
  createExactNodeExecutionEnvironment,
  createExactNodePathEnvironment,
  findExecutableOnPath,
  quoteWindowsCommandArgument,
} from '../../src/infrastructure/process.ts';

test('共享进程基础层保留参数并只为 Windows command shim 启用 shell', () => {
  const args = ['--version'];
  const shim = buildCommandInvocation('C:\\tools\\openspec.cmd', args, { platform: 'win32' });
  assert.deepEqual(shim, { executable: 'C:\\tools\\openspec.cmd', args: ['--version'], shell: true });
  args.push('--extra');
  assert.deepEqual(shim.args, ['--version']);
  assert.equal(buildCommandInvocation('C:\\tools\\openspec.exe', [], { platform: 'win32' }).shell, false);
  assert.equal(buildCommandInvocation('/usr/local/bin/openspec', [], { platform: 'darwin' }).shell, false);
  assert.deepEqual(
    buildCommandInvocation('C:\\tools\\buildr.cmd', ['--description', 'Package parity workspace'], { platform: 'win32' }).args,
    ['--description', '"Package parity workspace"'],
  );
  assert.equal(quoteWindowsCommandArgument(''), '""');
  assert.equal(quoteWindowsCommandArgument('plain'), 'plain');
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

test('exact Node environment按 Windows 大小写不敏感语义保留原生 Path', () => {
  const exact = createExactNodePathEnvironment({
    Path: 'C:\\Windows\\System32;C:\\Tools',
    TEMP: 'C:\\Temp',
  }, 'C:\\hostedtoolcache\\windows\\node\\24.15.0\\x64', { platform: 'win32' });
  assert.equal(
    exact.env.PATH,
    'C:\\hostedtoolcache\\windows\\node\\24.15.0\\x64;C:\\Windows\\System32;C:\\Tools',
  );
  assert.equal(Object.hasOwn(exact.env, 'Path'), false);
  assert.equal(exact.env.TEMP, 'C:\\Temp');
  assert.deepEqual(exact.pathEntries, [
    'C:\\hostedtoolcache\\windows\\node\\24.15.0\\x64',
    'C:\\Windows\\System32',
    'C:\\Tools',
  ]);
});

test('exact Node environment同时冻结父进程 executable 与子进程 PATH identity', (t) => {
  if (process.platform === 'win32') return t.skip('POSIX fake PATH fixture');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-exact-node-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fakeNode = path.join(root, 'node');
  fs.writeFileSync(fakeNode, '#!/bin/sh\necho fake-node >&2\nexit 97\n', { mode: 0o755 });
  const exact = createExactNodeExecutionEnvironment({
    nodeExecutable: process.execPath,
    env: { ...process.env, PATH: `${root}${path.delimiter}${process.env.PATH || ''}` },
    expectedVersion: process.versions.node,
    requireNpm: true,
  });
  assert.equal(exact.audit.executable, fs.realpathSync(process.execPath));
  assert.equal(exact.audit.pathHead, path.dirname(fs.realpathSync(process.execPath)));
  assert.equal(exact.env.PATH.split(path.delimiter)[0], exact.audit.bin);
  const child = spawnSync('node', ['-p', 'JSON.stringify({version:process.versions.node,execPath:process.execPath})'], { encoding: 'utf8', env: exact.env });
  assert.equal(child.status, 0, child.stderr);
  const identity = JSON.parse(child.stdout);
  assert.equal(identity.version, process.versions.node);
  assert.equal(fs.realpathSync(identity.execPath), exact.audit.executable);
  assert.match(exact.audit.identity, /^sha256-[a-f0-9]{64}$/);
  assert.throws(() => createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, expectedVersion: '0.0.0' }), /does not match required/);
  assert.throws(() => createExactNodeExecutionEnvironment({ nodeExecutable: 'node' }), /absolute executable path/u);
  assert.throws(() => createExactNodeExecutionEnvironment({ nodeExecutable: path.join(root, 'missing-node') }), /is not executable/u);
});
