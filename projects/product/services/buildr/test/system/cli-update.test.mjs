import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import { buildCliUpdatePlan, compareVersions, executeCliUpdatePlan, identifyCliSource } from '../../src/application/cli-update.mjs';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { createInstallationOrigin } from '../../src/infrastructure/product-identity/installation-origin.mjs';
import { createProductUpdateAuthority } from '../../src/infrastructure/product-identity/installation-registry.mjs';
import { canonicalApplicationPayloadIdentity } from '../../src/infrastructure/product-resources/index.mjs';

function origin(channel, version = '1.0.0') {
  const runtimeRole = channel === 'npm' ? 'host' : channel === 'platform' ? 'product' : 'development';
  return createInstallationOrigin({
    channel, runtimeRole, package: '@buildr-ai/buildr', version,
    protocolIdentity: 'buildr.web-protocol/v1',
    applicationPayloadDigest: `sha256-${'a'.repeat(64)}`,
    sourceCommit: 'b'.repeat(40), sourceTag: channel === 'platform' ? `v${version}` : null,
    platform: channel === 'platform' ? 'darwin' : null,
    architecture: channel === 'platform' ? 'arm64' : null,
    nodeVersion: channel === 'platform' ? '24.15.0' : null,
    installUnit: channel === 'platform' ? 'ai.buildr.web' : `@buildr-ai/buildr@${version}`,
  });
}

function formalOriginOptions(channel, version = '1.0.0') {
  const initial = origin(channel, version);
  const payloadManifest = {
    schemaVersion: 'buildr.application-payload/v1',
    packageName: initial.package,
    buildrVersion: initial.version,
    protocolIdentity: initial.protocolIdentity,
    sourceCommit: initial.sourceCommit,
    enginesNode: '>=24.15.0 <25',
    productionDependencies: [],
    files: [
      'resources/product/package.json',
      'resources/product/package/manifest.yml',
      'resources/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
      'resources/product/src/interfaces/local-app/web-dist/index.html',
      'resources/runtime/read-worker.cjs',
      'runtime/buildr.cjs',
    ].map((file) => ({ path: file, mode: 0o644, size: 0, sha256: '0'.repeat(64) })),
  };
  payloadManifest.applicationPayloadDigest = canonicalApplicationPayloadIdentity(payloadManifest);
  return {
    origin: createInstallationOrigin({ ...initial, applicationPayloadDigest: payloadManifest.applicationPayloadDigest }),
    payloadManifest,
  };
}

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
  assert.equal(source.mode, 'development');
  assert.equal(sameFilesystemPath(source.projectRoot, path.join(root, 'projects', 'product')), true);
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

test('update rejects a self-consistent formal receipt bound to another payload digest', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-payload-mismatch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.0.0"}\n');
  const formal = formalOriginOptions('npm');
  const mismatched = createInstallationOrigin({ ...formal.origin, applicationPayloadDigest: `sha256-${'f'.repeat(64)}` });
  const source = identifyCliSource(root, { origin: mismatched, payloadManifest: formal.payloadManifest });
  assert.equal(source.mode, 'unknown');
  assert.equal(source.channel, 'unknown');
  assert.equal(source.installationIdentity, null);
  assert.match(source.blockingReasons.join('\n'), /applicationPayloadDigest/);
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
  assert.equal(plan.mode, 'development');
  assert.equal(plan.status, 'blocked');
  assert.deepEqual(Object.keys(plan).sort(), ['available', 'blockingReasons', 'channel', 'current', 'mode', 'nextActions', 'sourceStatus', 'status', 'strategy', 'versionStatus']);
  assert.match(plan.blockingReasons.join('\n'), /upstream/);
});

test('npm 来源必须由 receipt 证明，目录形状本身保持 unknown', (t) => {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-prefix-'));
  t.after(() => fs.rmSync(prefix, { recursive: true, force: true }));
  const productRoot = path.join(prefix, ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules', '@buildr-ai', 'buildr');
  fs.mkdirSync(productRoot, { recursive: true });
  fs.writeFileSync(path.join(productRoot, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.0.0"}\n');
  assert.equal(identifyCliSource(productRoot).mode, 'unknown');
  const updateAuthority = createProductUpdateAuthority({
    nodeExecutable: process.execPath,
    npmCliPath: path.join(prefix, 'npm-cli.mjs'),
    prefix,
  });
  const source = identifyCliSource(productRoot, {
    ...formalOriginOptions('npm'),
    registration: { status: 'installed', entry: { updateAuthority }, reason: null },
  });
  assert.equal(source.mode, 'npm');
  assert.equal(source.installPrefix, prefix);
  assert.deepEqual(source.updateAuthority, updateAuthority);
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
  const prefix = path.join(fixture, 'safe-prefix');
  fs.mkdirSync(prefix);
  const log = path.join(fixture, 'npm.log');
  const npmCli = path.join(fixture, 'npm-cli.mjs');
  fs.writeFileSync(npmCli, `import fs from 'node:fs'; fs.writeFileSync(process.env.INSTALL_LOG, process.argv.slice(2).join(' ') + '\\n');\n`);
  const updateAuthority = createProductUpdateAuthority({ nodeExecutable: process.execPath, npmCliPath: npmCli, prefix });
  const plan = {
    mode: 'npm',
    status: 'update-available',
    strategy: 'npm-install',
    current: { package: '@buildr-ai/buildr', installPrefix: prefix, updateAuthority },
    available: { version: '2.0.0' },
  };
  const result = executeCliUpdatePlan(plan, { env: { ...process.env, PATH: '', INSTALL_LOG: log } });
  assert.equal(result.ok, true);
  assert.equal(fs.readFileSync(log, 'utf8').trim(), `install --global --prefix ${prefix} @buildr-ai/buildr@2.0.0`);
});

test('npm update query and install both use registered Host Node and npm CLI with an empty PATH', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-authority-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const prefix = path.join(fixture, 'prefix');
  const productRoot = path.join(prefix, 'lib', 'node_modules', '@buildr-ai', 'buildr', 'payload', 'product');
  const npmCli = path.join(fixture, 'npm-cli.mjs');
  const queryLog = path.join(fixture, 'query.log');
  fs.mkdirSync(productRoot, { recursive: true });
  fs.writeFileSync(path.join(productRoot, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.0.0"}\n');
  fs.writeFileSync(npmCli, `import fs from 'node:fs'; fs.writeFileSync(process.env.QUERY_LOG, process.argv.slice(2).join(' ') + '\\n'); process.stdout.write('"2.0.0"\\n');\n`);
  const updateAuthority = createProductUpdateAuthority({ nodeExecutable: process.execPath, npmCliPath: npmCli, prefix });
  const plan = buildCliUpdatePlan(productRoot, {
    ...formalOriginOptions('npm'),
    registration: { status: 'installed', entry: { updateAuthority }, reason: null },
    registryCommandOptions: { env: { ...process.env, PATH: '', QUERY_LOG: queryLog } },
  });
  assert.equal(plan.status, 'update-available');
  assert.equal(plan.strategy, 'npm-install');
  assert.equal(fs.readFileSync(queryLog, 'utf8').trim(), 'view @buildr-ai/buildr version --json');
  assert.equal(plan.current.updateAuthority.nodeExecutable, process.execPath);
  assert.equal(plan.current.updateAuthority.npmCliPath, npmCli);

  fs.rmSync(npmCli);
  const tampered = buildCliUpdatePlan(productRoot, {
    ...formalOriginOptions('npm'),
    registration: { status: 'installed', entry: { updateAuthority }, reason: null },
    registryCommandOptions: { env: { ...process.env, PATH: '', QUERY_LOG: queryLog } },
  });
  assert.equal(tampered.status, 'blocked');
  assert.match(tampered.blockingReasons.join('\n'), /npm CLI is unavailable/);
});

test('npm --ignore-scripts authority remains null and update check fails closed without PATH lookup', (t) => {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-update-no-authority-'));
  t.after(() => fs.rmSync(prefix, { recursive: true, force: true }));
  const productRoot = path.join(prefix, 'payload', 'product');
  fs.mkdirSync(productRoot, { recursive: true });
  fs.writeFileSync(path.join(productRoot, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.0.0"}\n');
  const plan = buildCliUpdatePlan(productRoot, {
    ...formalOriginOptions('npm'),
    registration: { status: 'installed', entry: { updateAuthority: null }, reason: null },
    registryCommandOptions: { env: { ...process.env, PATH: '' } },
  });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.available.version, null);
  assert.match(plan.blockingReasons.join('\n'), /update authority/);
});

test('npm update authority 缺失时不会从 PATH 或 prefix 猜测 package manager', () => {
  const result = executeCliUpdatePlan({
    mode: 'npm', status: 'update-available', strategy: 'none',
    current: { package: '@buildr-ai/buildr', installPrefix: '/untrusted/prefix', updateAuthority: null },
    available: { version: '2.0.0' },
  }, { env: { ...process.env, PATH: '/untrusted' } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'npm-update-authority-required');
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
