import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildInstallationInventory,
  inspectCurrentInstance,
  inspectCurrentInstanceReadiness,
} from '../../src/system/installation/application/product-installation-status.ts';
import { createInstallationOrigin } from '../../src/system/installation/infrastructure/installation-origin.ts';
import { canonicalApplicationPayloadIdentity } from '../../src/infrastructure/product-resources/index.ts';
import {
  acquireExclusiveFileLock,
  releaseExclusiveFileLock,
} from '../../src/infrastructure/filesystem/index.ts';
import {
  PRODUCT_INSTALLATION_REGISTRY_SCHEMA,
  createProductUpdateAuthority,
  enrollProductInstallation,
  findRegisteredProductInstallation,
  inspectProductInstallationRegistryEntry,
  readProductInstallationRegistry,
  productInstallationRegistryLockPath,
  validateProductInstallationRegistry,
} from '../../src/system/installation/infrastructure/installation-registry.ts';

const installationRegistryModule: any = new URL('../../src/system/installation/infrastructure/installation-registry.ts', import.meta.url).href;

function origin(channel: any, version: any = '1.2.3'): any  {
  return createInstallationOrigin({
    channel,
    runtimeRole: channel === 'npm' ? 'host' : 'product',
    package: '@buildr-ai/buildr',
    version,
    protocolIdentity: 'buildr.web-protocol/v1',
    applicationPayloadDigest: `sha256-${channel === 'npm' ? 'a' : 'b'}`.padEnd(71, channel === 'npm' ? 'a' : 'b'),
    sourceCommit: channel === 'npm' ? 'c'.repeat(40) : 'd'.repeat(40),
    sourceTag: channel === 'platform' ? `v${version}` : null,
    platform: channel === 'platform' ? 'darwin' : null,
    architecture: channel === 'platform' ? 'arm64' : null,
    nodeVersion: channel === 'platform' ? process.versions.node : null,
    installUnit: channel === 'platform' ? 'ai.buildr.web.pkg' : `@buildr-ai/buildr@${version}`,
  });
}

function payloadManifest(value: any): any  {
  const manifest: any = {
    schemaVersion: 'buildr.application-payload/v1',
    packageName: value.package,
    buildrVersion: value.version,
    protocolIdentity: value.protocolIdentity,
    sourceCommit: value.sourceCommit,
    enginesNode: '>=24.15.0 <25',
    productionDependencies: [],
    files: [
      'resources/product/package.json',
      'resources/product/resources/manifest.yml',
      'resources/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
      'resources/product/web-dist/index.html',
      'resources/runtime/read-worker.cjs',
      'runtime/buildr.cjs',
    ].map((file: any) => ({ path: file, mode: 0o644, size: 0, sha256: '0'.repeat(64) })),
  };
  manifest.applicationPayloadDigest = canonicalApplicationPayloadIdentity(manifest);
  return manifest;
}

function boundOrigin(channel: any, version: any = '1.2.3'): any  {
  const initial: any = origin(channel, version);
  const manifest: any = payloadManifest(initial);
  return {
    manifest,
    origin: createInstallationOrigin({ ...initial, applicationPayloadDigest: manifest.applicationPayloadDigest }),
  };
}

function installationFixture(root: any, channel: any, version: any = '1.2.3'): any  {
  const base: any = path.join(root, channel);
  const envelopePath: any = path.join(base, 'installation-origin.json');
  const productRoot: any = path.join(base, 'payload', 'product');
  const entryPath: any = path.join(base, channel === 'platform' ? 'buildr' : 'bin/buildr.mjs');
  const runtimeExecutable: any = channel === 'platform' ? entryPath : process.execPath;
  fs.mkdirSync(productRoot, { recursive: true });
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  const identity: any = boundOrigin(channel, version);
  fs.writeFileSync(path.join(productRoot, 'package.json'), `${JSON.stringify({ name: '@buildr-ai/buildr', version })}\n`);
  fs.writeFileSync(path.join(base, 'application-payload.json'), `${JSON.stringify(identity.manifest, null, 2)}\n`);
  fs.writeFileSync(envelopePath, `${JSON.stringify(identity.origin, null, 2)}\n`);
  fs.writeFileSync(entryPath, channel === 'platform' ? 'SEA fixture\n' : 'npm entry fixture\n');
  return { envelopePath, productRoot, entryPath, runtimeExecutable, updateAuthority: null };
}

function temporary(t: any): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-product-installations-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function wait(milliseconds: any): any  {
  return new Promise((resolve: any) => setTimeout(resolve, milliseconds));
}

async function waitForFile(file: any, timeoutMs: any = 5_000): Promise<any>  {
  const deadline: any = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for child-process marker ${file}.`);
    await wait(10);
  }
}

function spawnEnrollmentChild(config: any): any  {
  const source: any = `
    import fs from 'node:fs';
    import { enrollProductInstallation } from ${JSON.stringify(installationRegistryModule)};
    const config = JSON.parse(process.argv[1]);
    const input = JSON.parse(fs.readFileSync(config.inputFile, 'utf8'));
    const pause = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
    const options = { file: config.registryFile, lockTimeoutMs: 5000 };
    if (config.acquiredMarker) options.onRegistryLockAcquired = () => {
      fs.writeFileSync(config.acquiredMarker, 'acquired\\n');
      while (!fs.existsSync(config.releaseMarker)) pause(10);
    };
    if (config.waitMarker) options.lockWait = (milliseconds) => {
      if (!fs.existsSync(config.waitMarker)) fs.writeFileSync(config.waitMarker, 'waiting\\n');
      pause(milliseconds);
    };
    const result = enrollProductInstallation(input, options);
    process.stdout.write(JSON.stringify({ action: result.action, entryPath: result.entry.entryPath }));
  `;
  const child: any = spawn(process.execPath, ['--input-type=module', '-e', source, JSON.stringify(config)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout: any = '';
  let stderr: any = '';
  child.stdout.on('data', (chunk: any) => { stdout += chunk; });
  child.stderr.on('data', (chunk: any) => { stderr += chunk; });
  const completed: any = new Promise((resolve: any, reject: any) => {
    child.once('error', reject);
    child.once('close', (code: any, signal: any) => resolve({ code, signal, stdout, stderr }));
  });
  return { child, completed };
}

test('formal installation enrollment is closed and idempotent', (t: any) => {
  const root: any = temporary(t);
  const file: any = path.join(root, 'app-data', 'product-installations.json');
  const input: any = installationFixture(root, 'npm');
  const first: any = enrollProductInstallation(input, { file });
  const firstBytes: any = fs.readFileSync(file, 'utf8');
  const firstModifiedAt: any = fs.statSync(file).mtimeMs;
  const second: any = enrollProductInstallation(input, { file });
  assert.equal(first.action, 'registered');
  assert.equal(second.action, 'reused');
  assert.equal(fs.readFileSync(file, 'utf8'), firstBytes);
  assert.equal(fs.statSync(file).mtimeMs, firstModifiedAt, 'reused enrollment must not rewrite the registry file');
  const observed: any = readProductInstallationRegistry({ file });
  assert.equal(observed.status, 'ready');
  assert.equal(observed.registry.schemaVersion, PRODUCT_INSTALLATION_REGISTRY_SCHEMA);
  assert.equal(observed.registry.installations.length, 1);
  assert.equal(observed.registry.installations[0].origin.channel, 'npm');
  assert.equal(observed.registry.installations[0].entryPath, input.entryPath);
  assert.equal(observed.registry.installations[0].runtime.executable, process.execPath);
  assert.equal(observed.registry.installations[0].updateAuthority, null);
  assert.throws(
    () => validateProductInstallationRegistry({ ...observed.registry, guessedFromPath: true }),
    /unsupported fields/,
  );
});

test('registry refuses enrollment and installed status when a self-consistent origin names another payload digest', (t: any) => {
  const root: any = temporary(t);
  const file: any = path.join(root, 'app-data', 'product-installations.json');
  const input: any = installationFixture(root, 'npm');
  const matching: any = JSON.parse(fs.readFileSync(input.envelopePath, 'utf8'));
  const mismatched: any = createInstallationOrigin({ ...matching, applicationPayloadDigest: `sha256-${'f'.repeat(64)}` });
  fs.writeFileSync(input.envelopePath, `${JSON.stringify(mismatched, null, 2)}\n`);
  assert.throws(() => enrollProductInstallation(input, { file }), /applicationPayloadDigest/);
  assert.equal(fs.existsSync(file), false, 'a payload-mismatched origin must not create a registry');

  fs.writeFileSync(input.envelopePath, `${JSON.stringify(matching, null, 2)}\n`);
  const enrolled: any = enrollProductInstallation(input, { file });
  fs.writeFileSync(input.envelopePath, `${JSON.stringify(mismatched, null, 2)}\n`);
  const inspected: any = inspectProductInstallationRegistryEntry(enrolled.entry);
  assert.equal(inspected.status, 'invalid');
  assert.match(inspected.reason, /applicationPayloadDigest/);
});

test('two real processes serialize enrollment and preserve both distinct installations', async (t: any) => {
  const root: any = temporary(t);
  const file: any = path.join(root, 'app-data', 'product-installations.json');
  const firstInput: any = installationFixture(path.join(root, 'first-prefix'), 'npm');
  const secondInput: any = installationFixture(path.join(root, 'second-prefix'), 'npm');
  const firstInputFile: any = path.join(root, 'first-input.json');
  const secondInputFile: any = path.join(root, 'second-input.json');
  const acquiredMarker: any = path.join(root, 'first-acquired');
  const releaseMarker: any = path.join(root, 'release-first');
  const waitMarker: any = path.join(root, 'second-waiting');
  fs.writeFileSync(firstInputFile, JSON.stringify(firstInput));
  fs.writeFileSync(secondInputFile, JSON.stringify(secondInput));

  const children: any[] = [];
  t.after(() => {
    if (fs.existsSync(root)) fs.writeFileSync(releaseMarker, 'release\n');
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  });
  const first: any = spawnEnrollmentChild({
    inputFile: firstInputFile,
    registryFile: file,
    acquiredMarker,
    releaseMarker,
  });
  children.push(first.child);
  await waitForFile(acquiredMarker);
  const second: any = spawnEnrollmentChild({
    inputFile: secondInputFile,
    registryFile: file,
    waitMarker,
  });
  children.push(second.child);
  await waitForFile(waitMarker);
  assert.equal(fs.existsSync(file), false, 'first process must still hold the lock before its registry read/write');
  fs.writeFileSync(releaseMarker, 'release\n');

  const [firstResult, secondResult]: any = await Promise.all([first.completed, second.completed]);
  for (const result of [firstResult, secondResult]) {
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.equal(JSON.parse(result.stdout).action, 'registered');
  }
  const observed: any = readProductInstallationRegistry({ file });
  assert.equal(observed.status, 'ready');
  assert.deepEqual(
    observed.registry.installations.map((item: any) => item.entryPath).sort(),
    [firstInput.entryPath, secondInput.entryPath].sort(),
  );
  assert.equal(fs.existsSync(productInstallationRegistryLockPath({ file })), false);
});

test('registry lock times out fail-closed, releases only its exact token, and safely reclaims a dead owner', (t: any) => {
  const root: any = temporary(t);
  const file: any = path.join(root, 'product-installations.json');
  const lockFile: any = productInstallationRegistryLockPath({ file });
  const input: any = installationFixture(root, 'npm');
  const liveOwner: any = acquireExclusiveFileLock(lockFile, file);
  const lockedBytes: any = fs.readFileSync(lockFile, 'utf8');
  const wrongOwner: any = {
    ...liveOwner,
    record: { ...liveOwner.record, token: 'f'.repeat(32) },
  };
  assert.equal(releaseExclusiveFileLock(wrongOwner), false);
  assert.equal(fs.readFileSync(lockFile, 'utf8'), lockedBytes, 'a mismatched token must not release another owner');
  assert.throws(
    () => enrollProductInstallation(input, { file, lockTimeoutMs: 0 }),
    (error: any) => error.code === 'buildr_exclusive_file_lock_timeout' && /pid=/.test(error.message),
  );
  assert.equal(fs.existsSync(file), false, 'lock timeout must not write a partial registry');
  assert.equal(fs.readFileSync(lockFile, 'utf8'), lockedBytes, 'lock timeout must preserve the live owner');
  assert.equal(releaseExclusiveFileLock(liveOwner), true);

  const staleOwner: any = acquireExclusiveFileLock(lockFile, file);
  const enrolled: any = enrollProductInstallation(input, {
    file,
    lockTimeoutMs: 100,
    lockOwnerAlive: (pid: any, record: any) => {
      assert.equal(pid, staleOwner.record.pid);
      assert.equal(record.token, staleOwner.record.token);
      return false;
    },
  });
  assert.equal(enrolled.action, 'registered');
  assert.equal(readProductInstallationRegistry({ file }).registry.installations.length, 1);
  assert.equal(releaseExclusiveFileLock(staleOwner), false, 'a reclaimed stale token cannot release a later owner');
  assert.equal(fs.existsSync(lockFile), false);

  fs.writeFileSync(lockFile, '{"schemaVersion":"tampered"}\n');
  const invalidBytes: any = fs.readFileSync(lockFile, 'utf8');
  assert.throws(
    () => enrollProductInstallation(input, { file, lockTimeoutMs: 0 }),
    (error: any) => error.code === 'buildr_exclusive_file_lock_timeout' && /invalid-or-unknown/.test(error.message),
  );
  assert.equal(fs.readFileSync(lockFile, 'utf8'), invalidBytes, 'an invalid unknown owner must fail closed instead of being reclaimed');
});

test('two npm entries sharing one Host Node remain distinct by explicit envelope, product, and entry paths', (t: any) => {
  const root: any = temporary(t);
  const file: any = path.join(root, 'product-installations.json');
  const firstPrefix: any = path.join(root, 'first-prefix');
  const secondPrefix: any = path.join(root, 'second-prefix');
  const firstInput: any = installationFixture(firstPrefix, 'npm');
  const secondInput: any = installationFixture(secondPrefix, 'npm');
  const firstNpm: any = path.join(root, 'first', 'npm-cli.js');
  const secondNpm: any = path.join(root, 'second', 'npm-cli.js');
  fs.mkdirSync(path.dirname(firstNpm), { recursive: true });
  fs.mkdirSync(path.dirname(secondNpm), { recursive: true });
  fs.writeFileSync(firstNpm, 'npm fixture\n');
  fs.writeFileSync(secondNpm, 'npm fixture\n');
  firstInput.updateAuthority = createProductUpdateAuthority({
    nodeExecutable: process.execPath,
    npmCliPath: firstNpm,
    prefix: firstPrefix,
  });
  secondInput.updateAuthority = createProductUpdateAuthority({
    nodeExecutable: process.execPath,
    npmCliPath: secondNpm,
    prefix: secondPrefix,
  });
  const first: any = enrollProductInstallation(firstInput, { file });
  const second: any = enrollProductInstallation(secondInput, { file });
  assert.equal(first.entry.origin.ownershipIdentity, second.entry.origin.ownershipIdentity);
  assert.equal(first.entry.runtime.executable, second.entry.runtime.executable);
  assert.notEqual(first.entry.entryPath, second.entry.entryPath);
  assert.notEqual(first.entry.identity, second.entry.identity);
  assert.equal(readProductInstallationRegistry({ file }).registry.installations.length, 2);
  assert.equal(findRegisteredProductInstallation(first.entry.origin, {
    file,
    productRoot: firstInput.productRoot,
    envelopePath: firstInput.envelopePath,
    entryPath: firstInput.entryPath,
  }).entry.updateAuthority.prefix, firstInput.updateAuthority.prefix);
  assert.equal(findRegisteredProductInstallation(second.entry.origin, {
    file,
    productRoot: secondInput.productRoot,
    envelopePath: secondInput.envelopePath,
    entryPath: secondInput.entryPath,
  }).entry.updateAuthority.prefix, secondInput.updateAuthority.prefix);
  assert.equal(findRegisteredProductInstallation(first.entry.origin, {
    file,
    productRoot: firstInput.productRoot,
    envelopePath: firstInput.envelopePath,
    entryPath: secondInput.entryPath,
  }), null);
});

test('same npm installation upgrades null authority once and later startup enrollment preserves it byte-for-byte', (t: any) => {
  const root: any = temporary(t);
  const file: any = path.join(root, 'app-data', 'product-installations.json');
  const prefix: any = path.join(root, 'prefix');
  const input: any = installationFixture(prefix, 'npm');
  const npmCliPath: any = path.join(root, 'npm-cli.js');
  fs.writeFileSync(npmCliPath, 'npm fixture\n');
  assert.equal(enrollProductInstallation(input, { file }).action, 'registered');
  const withAuthority: any = {
    ...input,
    updateAuthority: createProductUpdateAuthority({ nodeExecutable: process.execPath, npmCliPath, prefix }),
  };
  const upgraded: any = enrollProductInstallation(withAuthority, { file });
  assert.equal(upgraded.action, 'updated');
  assert.equal(upgraded.registry.installations.length, 1);
  assert.equal(upgraded.entry.updateAuthority.prefix, prefix);
  const bytes: any = fs.readFileSync(file, 'utf8');
  const reused: any = enrollProductInstallation(input, { file });
  assert.equal(reused.action, 'reused');
  assert.equal(reused.entry.updateAuthority.prefix, prefix);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes, 'normal CLI startup must not erase or rewrite enrolled npm authority');
});

test('authority path tamper becomes stale while registry identity tamper is invalid', (t: any) => {
  const root: any = temporary(t);
  const file: any = path.join(root, 'product-installations.json');
  const prefix: any = path.join(root, 'prefix');
  const input: any = installationFixture(prefix, 'npm');
  const npmCliPath: any = path.join(root, 'npm-cli.js');
  fs.writeFileSync(npmCliPath, 'npm fixture\n');
  input.updateAuthority = createProductUpdateAuthority({ nodeExecutable: process.execPath, npmCliPath, prefix });
  const enrolled: any = enrollProductInstallation(input, { file });
  assert.equal(inspectProductInstallationRegistryEntry(enrolled.entry).status, 'installed');
  fs.rmSync(npmCliPath);
  assert.equal(inspectProductInstallationRegistryEntry(enrolled.entry).status, 'stale');
  const raw: any = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.installations[0].updateAuthority.prefix = path.join(root, 'tampered-prefix');
  fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
  assert.equal(readProductInstallationRegistry({ file }).status, 'invalid');
});

test('registry inspection reports missing paths as stale and receipt drift as invalid without rewriting', (t: any) => {
  const root: any = temporary(t);
  const file: any = path.join(root, 'product-installations.json');
  const input: any = installationFixture(root, 'npm');
  const enrolled: any = enrollProductInstallation(input, { file });
  fs.rmSync(input.entryPath);
  assert.equal(inspectProductInstallationRegistryEntry(enrolled.entry).status, 'stale');
  fs.writeFileSync(input.entryPath, 'restored entry\n');
  fs.writeFileSync(input.envelopePath, `${JSON.stringify(origin('npm', '1.2.4'), null, 2)}\n`);
  const before: any = fs.readFileSync(file, 'utf8');
  const result: any = inspectProductInstallationRegistryEntry(enrolled.entry);
  assert.equal(result.status, 'invalid');
  assert.match(result.reason, /envelope identity drifted|does not match the application payload manifest/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('status reports npm and development without a retired platform channel or PATH scanning', (t: any) => {
  const root: any = temporary(t);
  const file: any = path.join(root, 'app-data', 'product-installations.json');
  enrollProductInstallation(installationFixture(root, 'npm'), { file });
  const currentProduct: any = path.join(root, 'current-product');
  fs.mkdirSync(currentProduct);
  fs.writeFileSync(path.join(currentProduct, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.2.3"}\n');
  const before: any = fs.readFileSync(file, 'utf8');
  const result: any = buildInstallationInventory(currentProduct, {
    installationRegistryFile: file,
    developmentLauncherRoot: path.join(root, 'not-installed-development'),
  });
  assert.equal(result.channels.npm.status, 'installed');
  assert.equal(result.channels.npm.identity.channel, 'npm');
  assert.deepEqual(Object.keys(result.channels).sort(), ['development', 'npm']);
  assert.equal('platform' in result.channels, false);
  assert.equal(result.currentInstallation.channel, 'unknown');
  assert.equal(result.installationRegistry.status, 'ready');
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'status must not mutate or repair the registry');
});

test('product installation registry rejects the retired platform channel', (t: any) => {
  const root: any = temporary(t);
  assert.throws(() => installationFixture(root, 'platform'), /Unsupported installation channel: platform/);
});

test('current instance inspection is read-only and distinguishes live, stale, and invalid receipts without health inference', (t: any) => {
  const root: any = temporary(t);
  const file: any = path.join(root, 'instance.json');
  const receipt: any = {
    schemaVersion: 'buildr.local-app-instance/v1',
    url: 'http://127.0.0.1:4317',
    secret: 'not-reported',
    pid: 4242,
    launcherIdentity: null,
    productIdentity: {
      channel: 'platform',
      version: '1.2.3',
      protocolIdentity: 'buildr.web-protocol/v1',
      applicationPayloadDigest: `sha256-${'a'.repeat(64)}`,
      installationIdentity: `sha256-${'b'.repeat(64)}`,
      runtime: { role: 'product', version: process.versions.node, executable: '/Applications/Buildr Web.app/Contents/MacOS/buildr', identity: `sha256-${'c'.repeat(64)}` },
    },
  };
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
  const before: any = fs.readFileSync(file, 'utf8');
  const modifiedAt: any = fs.statSync(file).mtimeMs;
  const live: any = inspectCurrentInstance({ instanceFile: file, pidProbe: (pid: any, signal: any) => { assert.equal(pid, 4242); assert.equal(signal, 0); } });
  assert.equal(live.status, 'live-unverified');
  assert.equal(live.observation.pidAlive, true);
  assert.equal(live.observation.endpoint, 'loopback');
  assert.equal(live.observation.health, 'not-probed');
  assert.equal(live.identity.runtimeRole, 'product');
  assert.equal(JSON.stringify(live).includes(receipt.secret), false);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.statSync(file).mtimeMs, modifiedAt, 'status inspection must not rewrite instance state');

  const missing: Error & Record<string, any> = new Error('missing process');
  missing.code = 'ESRCH';
  const stale: any = inspectCurrentInstance({ instanceFile: file, pidProbe: () => { throw missing; } });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.observation.pidAlive, false);

  fs.writeFileSync(file, `${JSON.stringify({ ...receipt, url: 'https://example.com:4317' }, null, 2)}\n`);
  let probed: any = false;
  const invalid: any = inspectCurrentInstance({ instanceFile: file, pidProbe: () => { probed = true; } });
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.observation.endpoint, 'invalid');
  assert.equal(probed, false, 'non-loopback receipts must be rejected before probing a PID');
});

test('installation readiness uses the receipt secret and proves ready, unhealthy, and unreachable without writes', async (t: any) => {
  const root: any = temporary(t);
  const file: any = path.join(root, 'instance.json');
  const receipt: any = {
    schemaVersion: 'buildr.local-app-instance/v1',
    url: 'http://127.0.0.1:4317',
    secret: 'fixture-secret',
    pid: 4242,
    launcherIdentity: null,
    productIdentity: {
      package: '@buildr-ai/buildr', version: '1.2.3', channel: 'platform',
      protocolIdentity: 'buildr.web-protocol/v1', applicationPayloadDigest: `sha256-${'a'.repeat(64)}`,
      installationIdentity: `sha256-${'b'.repeat(64)}`,
      runtime: { role: 'product', version: process.versions.node, executable: '/Applications/Buildr Web.app/Contents/MacOS/buildr', identity: `sha256-${'c'.repeat(64)}` },
      sourceCommit: 'd'.repeat(40),
    },
  };
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
  const before: any = fs.readFileSync(file, 'utf8');
  const ready: any = await inspectCurrentInstanceReadiness({
    instanceFile: file,
    pidProbe: () => {},
    fetchImpl: async (url: any, options: any) => {
      assert.equal(url, 'http://127.0.0.1:4317/api/v1/health');
      assert.equal(options.headers['x-buildr-instance'], receipt.secret);
      return { ok: true, json: async () => ({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: receipt.pid, productIdentity: receipt.productIdentity }) };
    },
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.observation.health, 'ready');
  assert.equal(JSON.stringify(ready).includes(receipt.secret), false);

  const unhealthy: any = await inspectCurrentInstanceReadiness({
    instanceFile: file,
    pidProbe: () => {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: receipt.pid, productIdentity: { ...receipt.productIdentity, version: '9.9.9' } }) }),
  });
  assert.equal(unhealthy.status, 'unhealthy');
  assert.equal(unhealthy.observation.health, 'unhealthy');

  const unreachable: any = await inspectCurrentInstanceReadiness({
    instanceFile: file,
    pidProbe: () => {},
    fetchImpl: async () => { throw new Error(`must not leak ${receipt.secret}`); },
  });
  assert.equal(unreachable.status, 'unreachable');
  assert.equal(unreachable.observation.health, 'unreachable');
  assert.equal(JSON.stringify(unreachable).includes(receipt.secret), false);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'readiness inspection must not rewrite instance state');
});

test('Doctor inventory分别投影双Web Root、双实例、空development registry与旧shared-root冲突', (t: any) => {
  const root: any = temporary(t);
  const currentProduct: any = path.join(root, 'current-product');
  fs.mkdirSync(currentProduct);
  fs.writeFileSync(path.join(currentProduct, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.2.3"}\n');
  const releasedRoot: any = path.join(root, 'released');
  const developmentRoot: any = path.join(root, 'development');
  fs.mkdirSync(releasedRoot, { recursive: true });
  const legacyDevelopment: any = {
    schemaVersion: 'buildr.local-app-instance/v1', url: 'http://127.0.0.1:4317', secret: 'legacy', pid: 4242,
    launcherIdentity: { channel: 'development', version: '1.2.3', protocolVersion: 1 },
    productIdentity: { channel: 'development', version: '1.2.3', protocolIdentity: 'buildr.web-protocol/v1', runtime: { role: 'development' } },
  };
  fs.writeFileSync(path.join(releasedRoot, 'instance.json'), `${JSON.stringify(legacyDevelopment, null, 2)}\n`);
  const result: any = buildInstallationInventory(currentProduct, {
    installationRegistryFile: path.join(root, 'product-installations.json'),
    developmentLauncherRoot: path.join(root, 'no-launcher'),
    instanceDataRoots: { released: releasedRoot, development: developmentRoot },
    pidProbe: () => {},
  });
  assert.equal(result.instances.released.dataRoot, releasedRoot);
  assert.equal(result.instances.released.status, 'profile-conflict');
  assert.equal(result.instances.released.identity.channel, 'development');
  assert.match(result.instances.released.reason, /公开退出动作/u);
  assert.equal(result.instances.development.dataRoot, developmentRoot);
  assert.equal(result.instances.development.status, 'absent');
  assert.equal(result.workspaceManagement.registries.released.status, 'absent');
  assert.equal(result.workspaceManagement.registries.development.status, 'absent');
});

test('Doctor inventory不打开SQLite即可报告双registry的real root或UUID冲突', (t: any) => {
  const root: any = temporary(t);
  const currentProduct: any = path.join(root, 'current-product');
  const workspace: any = path.join(root, 'workspace');
  const releasedRoot: any = path.join(root, 'released');
  const developmentRoot: any = path.join(root, 'development');
  fs.mkdirSync(currentProduct);
  fs.writeFileSync(path.join(currentProduct, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.2.3"}\n');
  fs.mkdirSync(path.join(workspace, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.buildr', 'workspace.yml'), 'schemaVersion: buildr.workspace/v1\nid: 123e4567-e89b-42d3-a456-426614174000\nname: Conflict\ndescription: Conflict\n');
  for (const dataRoot of [releasedRoot, developmentRoot]) {
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(path.join(dataRoot, 'workspace-registry.json'), `${JSON.stringify({ schemaVersion: 'buildr.local-workspace-registry/v1', roots: [workspace], lastOpenedRoot: workspace }, null, 2)}\n`);
  }
  const result: any = buildInstallationInventory(currentProduct, {
    installationRegistryFile: path.join(root, 'product-installations.json'),
    developmentLauncherRoot: path.join(root, 'no-launcher'),
    instanceDataRoots: { released: releasedRoot, development: developmentRoot },
  });
  assert.deepEqual(result.workspaceManagement.conflicts.map((conflict: any) => conflict.type), ['cross-channel-registration']);
  assert.equal(result.workspaceManagement.conflicts[0].workspaceId, '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(fs.existsSync(path.join(workspace, '.buildr', 'local', 'workspace.sqlite')), false);
});
