import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import { buildCliUpdatePlan, compareVersions, executeCliUpdatePlan, identifyCliSource } from '../../src/application/cli-update.mjs';

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function writePackage(root) {
  const serviceRoot = path.join(root, 'projects', 'product', 'services', 'buildr');
  fs.mkdirSync(serviceRoot, { recursive: true });
  fs.writeFileSync(path.join(serviceRoot, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.0.0"}\n');
  return serviceRoot;
}

test('CLI 来源识别关联 Git workspace 中的 Product Project 与 Buildr Service', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-git-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productRoot = writePackage(root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'buildr@example.com');
  git(root, 'config', 'user.name', 'Buildr Test');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  const source = identifyCliSource(productRoot);
  assert.equal(source.mode, 'development-checkout');
  assert.equal(source.projectRoot, fs.realpathSync(path.join(root, 'projects', 'product')));
  assert.deepEqual(source.service, { projectCode: 'product', code: 'buildr' });
});

test('无法证明来源时 fail closed', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-unknown-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.0.0"}\n');
  const source = identifyCliSource(root);
  assert.equal(source.mode, 'unknown');
  assert.equal(source.blockingReasons.length, 1);
});

test('开发 checkout 缺少 upstream 时 check 返回稳定阻塞结构', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-plan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productRoot = writePackage(root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'buildr@example.com');
  git(root, 'config', 'user.name', 'Buildr Test');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  const plan = buildCliUpdatePlan(productRoot, { fetch: false, registryLookup: () => '1.0.0' });
  assert.equal(plan.mode, 'development-checkout');
  assert.equal(plan.status, 'blocked');
  assert.deepEqual(Object.keys(plan).sort(), ['available', 'blockingReasons', 'current', 'mode', 'nextActions', 'sourceStatus', 'status', 'strategy', 'versionStatus']);
  assert.match(plan.blockingReasons.join('\n'), /upstream/);
});

test('npm global prefix 布局识别为 registry package', (t) => {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-prefix-'));
  t.after(() => fs.rmSync(prefix, { recursive: true, force: true }));
  const productRoot = path.join(prefix, ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules', '@buildr-ai', 'buildr');
  fs.mkdirSync(productRoot, { recursive: true });
  fs.writeFileSync(path.join(productRoot, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.0.0"}\n');
  const source = identifyCliSource(productRoot);
  assert.equal(source.mode, 'registry-package');
  assert.equal(source.installPrefix, fs.realpathSync(prefix));
});

test('开发者模式自动 fast-forward 到 upstream', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-ff-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const remote = path.join(fixture, 'remote.git');
  const seed = path.join(fixture, 'seed');
  const client = path.join(fixture, 'client');
  git(fixture, 'init', '--bare', '-q', remote);
  fs.mkdirSync(seed);
  git(seed, 'init', '-q');
  git(seed, 'config', 'user.email', 'buildr@example.com');
  git(seed, 'config', 'user.name', 'Buildr Test');
  writePackage(seed);
  git(seed, 'add', '.');
  git(seed, 'commit', '-qm', 'initial');
  git(seed, 'branch', '-M', 'main');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-qu', 'origin', 'main');
  git(fixture, 'clone', '-q', '--branch', 'main', remote, client);
  fs.writeFileSync(path.join(seed, 'remote.txt'), 'remote\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-qm', 'remote');
  git(seed, 'push', '-q');
  const plan = buildCliUpdatePlan(path.join(client, 'projects', 'product', 'services', 'buildr'), { registryLookup: () => '1.0.0' });
  assert.equal(plan.strategy, 'fast-forward');
  assert.equal(executeCliUpdatePlan(plan).ok, true);
  assert.equal(git(client, 'rev-parse', 'HEAD'), git(seed, 'rev-parse', 'HEAD'));
});

test('开发者模式只对本地未发布提交执行 rebase', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-rebase-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const remote = path.join(fixture, 'remote.git');
  const seed = path.join(fixture, 'seed');
  const client = path.join(fixture, 'client');
  git(fixture, 'init', '--bare', '-q', remote);
  fs.mkdirSync(seed);
  git(seed, 'init', '-q');
  git(seed, 'config', 'user.email', 'buildr@example.com');
  git(seed, 'config', 'user.name', 'Buildr Test');
  writePackage(seed);
  git(seed, 'add', '.');
  git(seed, 'commit', '-qm', 'initial');
  git(seed, 'branch', '-M', 'main');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-qu', 'origin', 'main');
  git(fixture, 'clone', '-q', '--branch', 'main', remote, client);
  git(client, 'config', 'user.email', 'buildr@example.com');
  git(client, 'config', 'user.name', 'Buildr Test');
  fs.writeFileSync(path.join(client, 'local.txt'), 'local\n');
  git(client, 'add', '.');
  git(client, 'commit', '-qm', 'local');
  fs.writeFileSync(path.join(seed, 'remote.txt'), 'remote\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-qm', 'remote');
  git(seed, 'push', '-q');
  const plan = buildCliUpdatePlan(path.join(client, 'projects', 'product', 'services', 'buildr'), { registryLookup: () => '1.0.0' });
  assert.equal(plan.strategy, 'rebase');
  assert.equal(executeCliUpdatePlan(plan).ok, true);
  assert.equal(fs.readFileSync(path.join(client, 'local.txt'), 'utf8').replace(/\r\n/g, '\n'), 'local\n');
  assert.equal(fs.readFileSync(path.join(client, 'remote.txt'), 'utf8').replace(/\r\n/g, '\n'), 'remote\n');
});

test('发布模式更新保持 package identity 与安装 prefix', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-npm-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const bin = path.join(fixture, 'bin');
  const log = path.join(fixture, 'npm.log');
  fs.mkdirSync(bin);
  const npm = path.join(bin, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const fakeNpm = process.platform === 'win32'
    ? `@echo off\r\necho %* > "${log}"\r\n`
    : `#!/bin/sh\nprintf '%s\\n' "$*" > "${log}"\n`;
  fs.writeFileSync(npm, fakeNpm);
  if (process.platform !== 'win32') fs.chmodSync(npm, 0o755);
  const plan = {
    mode: 'registry-package',
    status: 'update-available',
    strategy: 'npm-install',
    current: { package: '@buildr-ai/buildr', installPrefix: '/safe/prefix' },
    available: { version: '2.0.0' },
  };
  const result = executeCliUpdatePlan(plan, { env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
  assert.equal(result.ok, true);
  assert.equal(fs.readFileSync(log, 'utf8').trim(), 'install --global --prefix /safe/prefix @buildr-ai/buildr@2.0.0');
});

test('开发 checkout 区分 Git source 与 prerelease version 漂移', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-version-drift-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productRoot = writePackage(root);
  fs.writeFileSync(path.join(productRoot, 'package.json'), '{"name":"@buildr-ai/buildr","version":"0.1.0-rc.3"}\n');
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'buildr@example.com');
  git(root, 'config', 'user.name', 'Buildr Test');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  const branch = git(root, 'branch', '--show-current');
  git(root, 'remote', 'add', 'origin', root);
  git(root, 'update-ref', `refs/remotes/origin/${branch}`, 'HEAD');
  git(root, 'branch', '--set-upstream-to', `origin/${branch}`, branch);
  const plan = buildCliUpdatePlan(productRoot, { fetch: false, registryLookup: () => '0.1.0-rc.5' });
  assert.equal(plan.sourceStatus, 'up-to-date');
  assert.equal(plan.versionStatus, 'stale');
  assert.equal(plan.status, 'version-stale');
  assert.equal(plan.available.releasedVersion, '0.1.0-rc.5');
  assert.equal(plan.strategy, 'none');
  assert.equal(executeCliUpdatePlan(plan).ok, true);
});

test('开发 checkout registry 不可用时保留 Git source 结论', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-version-unknown-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productRoot = writePackage(root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'buildr@example.com');
  git(root, 'config', 'user.name', 'Buildr Test');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  const branch = git(root, 'branch', '--show-current');
  git(root, 'remote', 'add', 'origin', root);
  git(root, 'update-ref', `refs/remotes/origin/${branch}`, 'HEAD');
  git(root, 'branch', '--set-upstream-to', `origin/${branch}`, branch);
  const plan = buildCliUpdatePlan(productRoot, { fetch: false, registryLookup: () => { throw new Error('offline'); } });
  assert.equal(plan.sourceStatus, 'up-to-date');
  assert.equal(plan.versionStatus, 'unknown');
  assert.equal(plan.status, 'up-to-date');
});

test('prerelease version comparison distinguishes RC sequence', () => {
  assert.equal(compareVersions('0.1.0-rc.3', '0.1.0-rc.5') < 0, true);
  assert.equal(compareVersions('0.1.0-rc.5', '0.1.0-rc.5'), 0);
  assert.equal(compareVersions('0.1.0', '0.1.0-rc.5') > 0, true);
});
