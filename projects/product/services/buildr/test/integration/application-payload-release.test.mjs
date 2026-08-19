import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildApplicationPayload } from '../../scripts/release/application-payload.mjs';
import { createNpmPackStaging, createReleaseArtifact, npmBinSource, readReleaseArtifact } from '../../scripts/release/release-artifact.mjs';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { createInstallationOrigin } from '../../src/infrastructure/product-identity/installation-origin.mjs';
import { GENERATED_USER_REGISTRY_PACKAGE_SOURCES } from '../../src/infrastructure/product-layout.mjs';
import { verifyApplicationPayload } from '../../src/infrastructure/product-resources/index.mjs';
import { readSharedCandidatePackage } from '../verification/release/candidate-package.mjs';

const SOURCE_COMMIT = 'b'.repeat(40);
const serviceRoot = path.resolve(import.meta.dirname, '../..');

function npmCliForCurrentNode() {
  const executableDirectory = path.dirname(process.execPath);
  const candidates = [
    path.resolve(executableDirectory, '../lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(executableDirectory, 'node_modules/npm/bin/npm-cli.js'),
    process.env.npm_execpath,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate);
    } catch {}
  }
  throw new Error(`npm CLI for the current Host Node was not found beside ${process.execPath}`);
}

function runNpm(args, options) {
  return spawnSync(process.execPath, [npmCliForCurrentNode(), ...args], options);
}

async function candidateArtifact(root) {
  const shared = readSharedCandidatePackage();
  if (shared?.manifest) return {
    artifact: { tarball: shared.tarball, manifestPath: shared.manifestPath, manifest: shared.manifest },
    payloadDigest: shared.manifest.applicationPayloadDigest,
  };
  const payload = await buildApplicationPayload(path.join(root, 'payload'), SOURCE_COMMIT);
  return {
    artifact: createReleaseArtifact(payload.root, path.join(root, 'artifact')),
    payloadDigest: payload.manifest.applicationPayloadDigest,
  };
}

test('same inputs create byte-identical payload and installed resource mapping detects drift', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-application-payload-'));
  try {
    const first = await buildApplicationPayload(path.join(root, 'first'), SOURCE_COMMIT);
    const second = await buildApplicationPayload(path.join(root, 'second'), SOURCE_COMMIT);
    assert.deepEqual(first.manifest, second.manifest);
    assert.deepEqual(fs.readFileSync(path.join(first.root, 'runtime/buildr.cjs')), fs.readFileSync(path.join(second.root, 'runtime/buildr.cjs')));
    assert.deepEqual(first.manifest.files.filter((entry) => entry.path.includes('/launchers/')).map((entry) => entry.path), [
      'resources/product/package/launchers/assets/Buildr.icns',
      'resources/product/package/launchers/assets/Buildr.ico',
    ]);
    assert.equal(first.manifest.files.some((entry) => entry.path.endsWith('.map')), false);
    assert.equal(first.manifest.files.some((entry) => entry.path.endsWith('/web-dist/index.html')), true);
    assert.equal(first.manifest.files.some((entry) => entry.path.includes('/sqlite/migrations/0000_')), true);
    for (const relativePath of GENERATED_USER_REGISTRY_PACKAGE_SOURCES) {
      assert.equal(first.manifest.files.some((entry) => entry.path === `resources/product/${relativePath}`), false, relativePath);
    }
    const runtimeMetadata = JSON.parse(fs.readFileSync(path.join(first.root, 'resources/product/package.json'), 'utf8'));
    assert.equal(runtimeMetadata.devDependencies, undefined);
    assert.equal(runtimeMetadata.scripts, undefined);
    assert.deepEqual(Object.keys(runtimeMetadata.dependencies), ['yaml']);

    const staging = createNpmPackStaging(first.root, path.join(root, 'npm-staging'));
    assert.equal(verifyApplicationPayload(staging.root, { layout: 'installed' }).manifest.applicationPayloadDigest, first.manifest.applicationPayloadDigest);
    fs.appendFileSync(path.join(staging.root, 'payload/product/src/interfaces/local-app/web-dist/index.html'), 'drift');
    assert.throws(() => verifyApplicationPayload(staging.root, { layout: 'installed' }), /digest mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('payload verify runs from a clean tree with no node_modules or esbuild', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-payload-clean-verify-'));
  try {
    const payload = await buildApplicationPayload(path.join(root, 'payload'), SOURCE_COMMIT);
    const cleanRoot = path.join(root, 'clean-service');
    for (const relative of [
      'scripts/release/application-payload.mjs',
      'src/infrastructure/product-resources/index.mjs',
      'src/infrastructure/filesystem/filesystem-path-identity.mjs',
    ]) {
      const target = path.join(cleanRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(serviceRoot, relative), target);
    }
    assert.equal(fs.existsSync(path.join(cleanRoot, 'node_modules')), false);
    const result = spawnSync(process.execPath, [
      path.join(cleanRoot, 'scripts/release/application-payload.mjs'),
      'verify', '--payload', payload.root, '--layout', 'frozen',
    ], {
      cwd: cleanRoot,
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: '' },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).applicationPayloadDigest, payload.manifest.applicationPayloadDigest);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npm release artifact freezes one tarball with complete payload and no platform runtime', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-payload-'));
  try {
    const { artifact, payloadDigest } = await candidateArtifact(root);
    const readback = readReleaseArtifact(artifact.manifestPath, {
      packageName: '@buildr-ai/buildr',
      version: artifact.manifest.version,
      applicationPayloadDigest: payloadDigest,
    });
    assert.equal(readback.tarball, artifact.tarball);
    const paths = artifact.manifest.inventory.map((entry) => entry.path);
    for (const required of [
      'runtime/buildr.cjs',
      'scripts/postinstall.mjs',
      'payload/runtime/read-worker.cjs',
      'payload/product/src/interfaces/local-app/web-dist/index.html',
      'payload/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
      'payload/product/package/manifest.yml',
      'payload/product/package/launchers/assets/Buildr.icns',
      'payload/product/package/launchers/assets/Buildr.ico',
    ]) assert.equal(paths.includes(required), true, required);
    assert.equal(paths.some((value) => /(^|\/)node(?:\.exe)?(\/|$)/iu.test(value)), false);
    assert.deepEqual(paths.filter((value) => /(^|\/)launchers?(\/|$)/iu.test(value)), [
      'payload/product/package/launchers/assets/Buildr.icns',
      'payload/product/package/launchers/assets/Buildr.ico',
    ]);
    assert.equal(paths.some((value) => /\.(?:app|pkg|msi|map)$/iu.test(value)), false);
    for (const relativePath of GENERATED_USER_REGISTRY_PACKAGE_SOURCES) {
      assert.equal(paths.includes(`payload/product/${relativePath}`), false, relativePath);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('formal npm entry fails closed before enrollment when receipt and payload identities diverge', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-origin-mismatch-'));
  try {
    const { artifact } = await candidateArtifact(root);
    const prefix = path.join(root, 'prefix');
    const appData = path.join(root, 'app-data');
    const installed = runNpm(['install', '--offline', '--ignore-scripts', '--global', '--prefix', prefix, artifact.tarball], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter),
        npm_config_cache: path.join(root, 'npm-cache'),
        npm_config_update_notifier: 'false',
      },
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    const modules = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
    const packageRoot = path.join(modules, '@buildr-ai/buildr');
    const originPath = path.join(packageRoot, 'installation-origin.json');
    const matching = JSON.parse(fs.readFileSync(originPath, 'utf8'));
    const mismatched = createInstallationOrigin({ ...matching, applicationPayloadDigest: `sha256-${'f'.repeat(64)}` });
    fs.writeFileSync(originPath, `${JSON.stringify(mismatched, null, 2)}\n`);

    const result = spawnSync(process.execPath, [path.join(packageRoot, 'bin/buildr.mjs'), '--help'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: '', BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: appData },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Formal npm Buildr entry has no application-payload-bound installation origin/);
    assert.match(result.stderr, /applicationPayloadDigest/);
    assert.equal(fs.existsSync(path.join(appData, 'product-installations.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npm global postinstall enrolls identity-bound update authority for two prefixes and startup preserves it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-postinstall-'));
  try {
    const { artifact } = await candidateArtifact(root);
    const appData = path.join(root, 'app-data');
    const npmCache = path.join(root, 'npm-cache');
    const prefixes = [path.join(root, 'prefix-a'), path.join(root, 'prefix-b')];
    const entries = [];
    for (const prefix of prefixes) {
      const installed = runNpm(['install', '--offline', '--global', '--prefix', prefix, artifact.tarball], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter),
          BUILDR_APP_DATA_DIR: appData,
          BUILDR_PRODUCT_DATA_DIR: appData,
          npm_config_cache: npmCache,
          npm_config_update_notifier: 'false',
        },
      });
      assert.equal(installed.status, 0, installed.stderr || installed.stdout);
      const modules = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
      entries.push(path.join(modules, '@buildr-ai/buildr', 'bin/buildr.mjs'));
    }
    const registryFile = path.join(appData, 'product-installations.json');
    const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    assert.equal(registry.installations.length, 2);
    for (const [index, installation] of registry.installations.entries()) {
      assert.equal(installation.origin.channel, 'npm');
      assert.equal(installation.updateAuthority.type, 'npm-cli');
      assert.equal(sameFilesystemPath(installation.updateAuthority.nodeExecutable, process.execPath), true);
      assert.equal(sameFilesystemPath(installation.updateAuthority.prefix, prefixes[index]), true);
      assert.equal(fs.statSync(installation.updateAuthority.npmCliPath).isFile(), true);
      assert.equal(sameFilesystemPath(installation.entryPath, entries[index]), true);
    }
    const bytes = fs.readFileSync(registryFile, 'utf8');
    for (const entry of entries) {
      const help = spawnSync(process.execPath, [entry, '--help'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PATH: '', BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: appData },
      });
      assert.equal(help.status, 0, help.stderr);
    }
    assert.equal(fs.readFileSync(registryFile, 'utf8'), bytes, 'ordinary startup must reuse authority entries without rewriting them');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npm package uses only its compatible host Node for CLI and on-demand Buildr Web', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-installed-'));
  const appData = path.join(root, 'app-data');
  let web = null;
  try {
    const { artifact, payloadDigest } = await candidateArtifact(root);
    const prefix = path.join(root, 'prefix');
    const npmCache = path.join(root, 'npm-cache');
    const installed = runNpm(['install', '--offline', '--ignore-scripts', '--global', '--prefix', prefix, artifact.tarball], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter),
        npm_config_cache: npmCache,
        npm_config_update_notifier: 'false',
      },
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    const modules = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
    const packageRoot = path.join(modules, '@buildr-ai/buildr');
    const cli = path.join(packageRoot, 'bin/buildr.mjs');
    const runtimeEnv = {
      ...process.env,
      PATH: process.platform === 'win32' ? process.env.SystemRoot : '/usr/bin:/bin',
      BUILDR_APP_DATA_DIR: appData,
      BUILDR_PRODUCT_DATA_DIR: appData,
    };
    const run = (args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, env: runtimeEnv, encoding: 'utf8' });
    const help = run(['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage: buildr/);
    const developmentSchema = run(['__internal', 'task-development', 'planning', '--schema']);
    assert.equal(developmentSchema.status, 0, developmentSchema.stderr);
    const parsedDevelopmentSchema = JSON.parse(developmentSchema.stdout);
    assert.equal(parsedDevelopmentSchema.schemaVersion, 'buildr.task-development-driver-schema/v1');
    assert.equal(parsedDevelopmentSchema.action, 'planning');
    assert.equal(fs.existsSync(path.join(appData, 'instance.json')), false, 'ordinary CLI must not start HTTP');
    const installationRegistryFile = path.join(appData, 'product-installations.json');
    const firstRegistryBytes = fs.readFileSync(installationRegistryFile, 'utf8');
    const installationRegistry = JSON.parse(firstRegistryBytes);
    assert.equal(installationRegistry.schemaVersion, 'buildr.product-installation-registry/v1');
    assert.equal(installationRegistry.installations.length, 1);
    assert.equal(installationRegistry.installations[0].origin.channel, 'npm');
    assert.equal(sameFilesystemPath(installationRegistry.installations[0].entryPath, cli), true);
    assert.equal(installationRegistry.installations[0].runtime.executable, process.execPath);
    assert.equal(installationRegistry.installations[0].updateAuthority, null);
    const guide = run(['bootstrap', 'guide']);
    assert.equal(guide.status, 0, guide.stderr);
    assert.equal(fs.readFileSync(installationRegistryFile, 'utf8'), firstRegistryBytes, 'formal startup enrollment must be byte-idempotent');
    const installationStatus = run(['installation', 'status', '--json']);
    assert.equal(installationStatus.status, 0, installationStatus.stderr);
    const installation = JSON.parse(installationStatus.stdout);
    assert.equal(installation.channels.npm.status, 'current');
    assert.equal(installation.currentInstallation.channel, 'npm');
    assert.equal(installation.installationRegistry.status, 'ready');
    const identityResult = run(['version', '--json']);
    assert.equal(identityResult.status, 0, identityResult.stderr);
    const identity = JSON.parse(identityResult.stdout);
    assert.equal(identity.channel, 'npm');
    assert.equal(identity.runtime.role, 'host');
    assert.equal(identity.runtime.executable, process.execPath);
    assert.equal(identity.applicationPayloadDigest, payloadDigest);

    web = spawn(process.execPath, [cli, 'web', '--no-open', '--port', '0'], { cwd: root, env: runtimeEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    web.stderr.setEncoding('utf8');
    web.stderr.on('data', (chunk) => { stderr += chunk; });
    let instance = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { instance = JSON.parse(fs.readFileSync(path.join(appData, 'instance.json'), 'utf8')); } catch {}
      if (instance) break;
      if (web.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(instance, `Buildr Web did not create readiness identity: ${stderr}`);
    const health = await fetch(`${instance.url}/api/v1/health`, { headers: { 'x-buildr-instance': instance.secret } });
    assert.equal(health.status, 200);
    const healthIdentity = await health.json();
    assert.equal(healthIdentity.schemaVersion, 'buildr.local-app-health/v1');
    assert.equal(healthIdentity.status, 'ready');
    assert.equal(healthIdentity.pid, web.pid);
    assert.equal(healthIdentity.launcherIdentity, null);
    assert.equal(healthIdentity.previewIdentity, null);
    assert.equal(healthIdentity.productIdentity.channel, 'npm');
    assert.equal(healthIdentity.productIdentity.runtime.role, 'host');
    assert.equal(healthIdentity.productIdentity.applicationPayloadDigest, payloadDigest);
    assert.equal(instance.productIdentity.installationIdentity, healthIdentity.productIdentity.installationIdentity);
    const shell = await fetch(instance.url);
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /<div id="root"><\/div>/);
  } finally {
    if (web && web.exitCode === null) {
      web.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => web.once('close', resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
      if (web.exitCode === null) web.kill('SIGKILL');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npm thin entry rejects an incompatible host before loading Buildr', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-engine-'));
  try {
    const source = npmBinSource().replace('process.versions.node', "'23.99.0'");
    const entry = path.join(root, 'buildr.mjs');
    fs.writeFileSync(entry, source);
    const result = spawnSync(process.execPath, [entry, '--help'], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, />=24\.15\.0 <25/);
    assert.doesNotMatch(result.stderr, /module|payload|download failed/iu);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
