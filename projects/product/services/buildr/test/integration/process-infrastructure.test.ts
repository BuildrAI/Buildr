import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  assertMinimumNodeVersion,
  buildCommandInvocation,
  createExactNodeExecutionEnvironment,
  createExactNodePathEnvironment,
  findExecutableOnPath,
  quoteWindowsCommandArgument,
} from '../../src/infrastructure/process.ts';
import { prepareCandidateEnvironment } from '../../tools/verification/candidate-environment.ts';

test('Candidate preparation accepts the minimum, audits the active Node and rejects a higher floor before installing', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-candidate-node-minimum-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const versionFile = path.join(projectRoot, '.node-version');
  fs.writeFileSync(versionFile, '24.15.0\n');
  let calls = 0;
  const prepare = (profile: string) => prepareCandidateEnvironment({
    profile, roots: { serviceRoot: path.join(projectRoot, 'buildr'), webRoot: path.join(projectRoot, 'buildr-web'), projectRoot }, stream: { write: () => true },
    execute: (() => { calls++; return { status: 0, stdout: '', stderr: '' }; }) as any,
  });
  const result = prepare('base');
  assert.equal(result.node.version, process.versions.node);
  assert.equal(result.operations.length, 2);
  fs.writeFileSync(versionFile, '999.0.0\n');
  assert.throws(() => prepare('base'), /does not meet required minimum 999\.0\.0/);
  assert.equal(calls, 2);
  assert.doesNotThrow(() => prepare('host'), 'the explicit Host Node matrix bypass remains independent of the development floor');
});

test('最低 Node 版本允许更新补丁、次版本及主版本，拒绝低版本和非稳定版本', () => {
  for (const version of ['24.15.0', '24.15.1', '24.21.0', '25.0.0', '26.0.0']) {
    assert.doesNotThrow(() => assertMinimumNodeVersion(version, '24.15.0'));
  }
  for (const version of ['23.99.99', '24.14.99', '24.15.0-rc.1', '25.0.0-nightly', '24.15', '26..0', '26.0.0.1', '024.15.0', '24.015.0', '26.0.00', '9007199254740992.0.0', null]) {
    assert.throws(() => assertMinimumNodeVersion(version, '24.15.0'), /does not meet required minimum 24\.15\.0/);
  }
  assert.throws(() => assertMinimumNodeVersion('26.0.0', '>=24.15.0'), /Invalid minimum Node version/);
});

test('共享进程基础层保留参数并只为 Windows command shim 启用 shell', () => {
  const args: any[] = ['--version'];
  const shim: any = buildCommandInvocation('C:\\tools\\openspec.cmd', args, { platform: 'win32' });
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

test('共享 PATH 解析器在 Windows 语义下解析 PATHEXT shim', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-process-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable: any = path.join(root, 'openspec.CMD');
  fs.writeFileSync(executable, '@echo off\n');
  fs.chmodSync(executable, 0o755);
  assert.equal(findExecutableOnPath('openspec', {
    platform: 'win32',
    env: { PATH: root, PATHEXT: '.EXE;.CMD;.BAT' },
  }), executable);
});

test('exact Node environment按 Windows 大小写不敏感语义保留原生 Path', () => {
  const exact: any = createExactNodePathEnvironment({
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

test('exact Node environment同时冻结父进程 executable 与子进程 PATH identity', (t: any) => {
  if (process.platform === 'win32') return t.skip('POSIX fake PATH fixture');
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-exact-node-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fakeNode: any = path.join(root, 'node');
  fs.writeFileSync(fakeNode, '#!/bin/sh\necho fake-node >&2\nexit 97\n', { mode: 0o755 });
  const exact: any = createExactNodeExecutionEnvironment({
    nodeExecutable: process.execPath,
    env: { ...process.env, PATH: `${root}${path.delimiter}${process.env.PATH || ''}` },
    expectedVersion: process.versions.node,
    minimumVersion: '24.15.0',
    requireNpm: true,
  });
  assert.equal(exact.audit.executable, fs.realpathSync(process.execPath));
  assert.equal(exact.audit.pathHead, path.dirname(fs.realpathSync(process.execPath)));
  assert.equal(exact.env.PATH.split(path.delimiter)[0], exact.audit.bin);
  const child: any = spawnSync('node', ['-p', 'JSON.stringify({version:process.versions.node,execPath:process.execPath})'], { encoding: 'utf8', env: exact.env });
  assert.equal(child.status, 0, child.stderr);
  const identity: any = JSON.parse(child.stdout);
  assert.equal(identity.version, process.versions.node);
  assert.equal(fs.realpathSync(identity.execPath), exact.audit.executable);
  assert.match(exact.audit.identity, /^sha256-[a-f0-9]{64}$/);
  assert.equal(exact.audit.version, process.versions.node, 'audit records the active version rather than the compatibility minimum');
  assert.throws(() => createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, minimumVersion: '999.0.0' }), /does not meet required minimum 999\.0\.0/);
  assert.throws(() => createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, expectedVersion: '0.0.0' }), /does not match required/);
  assert.throws(() => createExactNodeExecutionEnvironment({ nodeExecutable: 'node' }), /absolute executable path/u);
  assert.throws(() => createExactNodeExecutionEnvironment({ nodeExecutable: path.join(root, 'missing-node') }), /is not executable/u);
});
