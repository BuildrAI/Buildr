import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createWebUpdateFlow } from '../../src/modules/installation/application/update-flow.ts';
import { registerApplicationCliUpdate } from '../../src/modules/installation/application/cli-update.ts';
import {
  PRODUCT_INSTALLATION_REGISTRY_SCHEMA,
  createProductUpdateAuthority,
  productInstallationRegistryEntryIdentity,
  productInstallationRegistryPath,
} from '../../src/modules/installation/infrastructure/installation-registry.ts';
import {
  createInstallationOrigin,
  runtimeIdentityForOrigin,
} from '../../src/modules/installation/infrastructure/installation-origin.ts';
import { canonicalApplicationPayloadIdentity } from '../../src/infrastructure/product-resources/index.ts';

async function waitFor(predicate: () => boolean, label: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`等待超时：${label}`);
}

// 端到端更新任务：真实 installation origin receipt、真实 product installation
// registry、真实 authority 校验、真实 spawnCommand 进程调用；npm CLI 用桩脚本
// 代替真实 registry 与安装副作用，网页交接只记录输入。
test('Buildr Web 分阶段更新：真实 npm 安装现场 prepare→ready→apply→交接', async (t: any) => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-update-flow-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));

  const prefix: any = path.join(fixture, 'prefix');
  const productRoot: any = path.join(prefix, 'lib', 'node_modules', '@buildr-ai', 'buildr');
  const entryPath: any = path.join(prefix, 'bin', 'buildr');
  const npmCli: any = path.join(prefix, 'npm-cli.mjs');
  const npmLog: any = path.join(fixture, 'npm.log');
  const productData: any = path.join(fixture, 'product-data');
  fs.mkdirSync(productRoot, { recursive: true });
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  fs.writeFileSync(entryPath, '#!/bin/sh\n');
  fs.mkdirSync(productData, { recursive: true });

  // 1. 真实 npm 安装现场：package、payload manifest、origin receipt、安装登记。
  fs.writeFileSync(path.join(productRoot, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.0.0"}\n');
  const payloadManifest: any = {
    schemaVersion: 'buildr.application-payload/v1',
    packageName: '@buildr-ai/buildr',
    buildrVersion: '1.0.0',
    protocolIdentity: 'buildr.web-protocol/v1',
    sourceCommit: 'b'.repeat(40),
    enginesNode: '>=24.15.0 <25',
    productionDependencies: [],
    files: [
      'resources/product/package.json',
      'resources/product/resources/manifest.yml',
      'resources/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
      'resources/product/web-dist/index.html',
      'resources/runtime/read-worker.cjs',
      'resources/runtime/upstream-openspec-worker.cjs',
      'runtime/buildr.cjs',
    ].map((file: any) => ({ path: file, mode: 0o644, size: 0, sha256: '0'.repeat(64) })),
  };
  payloadManifest.applicationPayloadDigest = canonicalApplicationPayloadIdentity(payloadManifest);
  fs.writeFileSync(path.join(productRoot, 'application-payload.json'), JSON.stringify(payloadManifest));
  const origin: any = createInstallationOrigin({
    channel: 'npm', runtimeRole: 'host', package: '@buildr-ai/buildr', version: '1.0.0',
    protocolIdentity: 'buildr.web-protocol/v1',
    applicationPayloadDigest: payloadManifest.applicationPayloadDigest,
    sourceCommit: 'b'.repeat(40), sourceTag: null, platform: null, architecture: null,
    nodeVersion: null, installUnit: '@buildr-ai/buildr@1.0.0',
  });
  const envelopePath: any = path.join(productRoot, 'installation-origin.json');
  fs.writeFileSync(envelopePath, JSON.stringify(origin));

  fs.writeFileSync(npmCli, `import fs from 'node:fs';
import path from 'node:path';
const [command, ...rest] = process.argv.slice(2);
fs.appendFileSync(process.env.NPM_STUB_LOG, process.argv.slice(2).join(' ') + '\\n');
if (command === 'view') { process.stdout.write(JSON.stringify({ latest: '1.1.0', next: '1.2.0-rc.1' }) + '\\n'); }
if (command === 'install') {
  const spec = rest[rest.length - 1];
  const version = spec.slice(spec.lastIndexOf('@') + 1);
  const pkgFile = path.join(process.env.NPM_STUB_PRODUCT_ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg) + '\\n');
}
`);

  const updateAuthority: any = createProductUpdateAuthority({ nodeExecutable: process.execPath, npmCliPath: npmCli, prefix });
  const entry: any = {
    origin,
    envelopePath,
    productRoot: fs.realpathSync(productRoot),
    entryPath,
    runtime: runtimeIdentityForOrigin(origin, { executable: process.execPath }),
    updateAuthority,
  };
  const registry: any = {
    schemaVersion: PRODUCT_INSTALLATION_REGISTRY_SCHEMA,
    installations: [{ ...entry, identity: productInstallationRegistryEntryIdentity(entry) }],
  };
  fs.writeFileSync(productInstallationRegistryPath({ dataRoot: productData }), JSON.stringify(registry));

  process.env.BUILDR_PRODUCT_DATA_DIR = productData;
  process.env.BUILDR_NPM_ENTRY_PATH = entryPath;
  process.env.NPM_STUB_LOG = npmLog;
  process.env.NPM_STUB_PRODUCT_ROOT = fs.realpathSync(productRoot);
  t.after(() => {
    delete process.env.BUILDR_PRODUCT_DATA_DIR;
    delete process.env.BUILDR_NPM_ENTRY_PATH;
    delete process.env.NPM_STUB_LOG;
    delete process.env.NPM_STUB_PRODUCT_ROOT;
  });

  // 2. 全真实依赖装配：只把网页交接端口换成记录桩。
  const handoffs: any[] = [];
  const application: any = registerApplicationCliUpdate({ productRoot: () => productRoot });
  const flow: any = createWebUpdateFlow({
    productRoot: () => productRoot,
    releaseAwareness: (options: any) => application.releaseAwareness(options),
    handoffUpdatedBuildrWeb: async (input: any) => { handoffs.push(input); return { status: 'restarted', version: input.expectedVersion }; },
  });

  const snapshot: any = flow.webUpdateStatus();
  assert.equal(snapshot.status, 'idle');
  assert.equal(snapshot.currentVersion, '1.0.0');

  const preparing: any = flow.webUpdatePrepare({ track: 'stable', expectedVersion: '1.1.0' });
  assert.equal(preparing.status, 'preparing');
  assert.equal(preparing.version, '1.1.0');
  await waitFor(() => flow.webUpdateStatus().status !== 'preparing', '任务离开 preparing');
  assert.equal(flow.webUpdateStatus().status, 'ready');
  const log: any = fs.readFileSync(npmLog, 'utf8');
  assert.ok(log.includes('view @buildr-ai/buildr dist-tags --json'), `npm view 应经真实 authority 调用：${log}`);
  assert.ok(log.includes('cache add @buildr-ai/buildr@1.1.0'), `npm cache add 应真实执行：${log}`);

  const applying: any = flow.webUpdateApply({ expectedVersion: '1.1.0' });
  assert.equal(applying.status, 'applying');
  await waitFor(() => flow.webUpdateStatus().status !== 'applying', '任务离开 applying');
  assert.equal(flow.webUpdateStatus().status, 'partial');
  assert.equal(flow.webUpdateStatus().error.code, 'update_running_version_mismatch');
  const installLog: any = fs.readFileSync(npmLog, 'utf8');
  assert.ok(installLog.includes(`install --global --prefer-offline --prefix ${prefix} @buildr-ai/buildr@1.1.0`), `npm install 应复用同一 authority：${installLog}`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8')).version, '1.1.0');
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].expectedVersion, '1.1.0');
  assert.equal(handoffs[0].previousInstallationIdentity, origin.ownershipIdentity);
  assert.equal(flow.webUpdateStatus().currentVersion, '1.0.0', '原进程仍运行旧版本，不以磁盘 package.json 冒充启动版本');
});

// 开发版模拟流程：真实 development checkout 夹具 + 真实 identifyCliSource 判出
// development 来源，下载与安装只走受控模拟；registry、authority、交接与子进程
// 依赖全部以桩计数，证明零外部副作用。
test('Buildr Web 开发版模拟更新：真实 development 现场 prepare→ready→apply→completed', async (t: any) => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-update-dev-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));

  const source: any = path.join(fixture, 'source');
  const productRoot: any = path.join(source, 'projects', 'product', 'services', 'buildr');
  fs.mkdirSync(path.join(productRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(productRoot, 'package.json'), '{"name":"@buildr-ai/buildr","version":"0.1.0"}\n');
  fs.writeFileSync(path.join(productRoot, 'src', 'runtime.ts'), 'export const value = 1;\n');
  const git: any = (...args: any[]) => execFileSync('git', ['-C', source, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('config', 'user.name', 'Buildr Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('add', '.');
  git('commit', '-qm', 'source fixture');

  const spawnCalls: any[] = [];
  const handoffs: any[] = [];
  let awarenessCalls = 0;
  const flow: any = createWebUpdateFlow({
    productRoot: () => productRoot,
    releaseAwareness: () => { awarenessCalls += 1; throw new Error('development 来源不应查询 registry'); },
    handoffUpdatedBuildrWeb: async (input: any) => { handoffs.push(input); return { status: 'restarted' }; },
    spawnProcess: async (...args: any[]) => { spawnCalls.push(args); return { ok: true, status: 0, stdout: '', stderr: '' }; },
    inspectAuthority: () => { throw new Error('development 来源不应检查 npm authority'); },
    devTiming: { downloadMs: 20, installMs: 20 },
  });

  const idle: any = flow.webUpdateStatus();
  assert.equal(idle.status, 'idle');
  assert.equal(idle.currentVersion, '0.1.0');

  const preparing: any = flow.webUpdatePrepare({ track: 'stable', expectedVersion: '0.1.1' });
  assert.equal(preparing.status, 'preparing');
  await waitFor(() => flow.webUpdateStatus().status !== 'preparing', '任务离开 preparing');
  assert.equal(flow.webUpdateStatus().status, 'ready');

  const applying: any = flow.webUpdateApply({ expectedVersion: '0.1.1' });
  assert.equal(applying.status, 'applying');
  await waitFor(() => flow.webUpdateStatus().status !== 'applying', '任务离开 applying');
  const completed: any = flow.webUpdateStatus();
  assert.equal(completed.status, 'completed');
  assert.equal(completed.version, '0.1.1');

  assert.equal(spawnCalls.length, 0, '模拟流程不得执行真实子进程');
  assert.equal(awarenessCalls, 0, '模拟流程不得查询 registry');
  assert.equal(handoffs.length, 0, '模拟流程不触发 npm 交接');
  assert.equal(JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8')).version, '0.1.0', '模拟安装不得改动真实文件');
});
