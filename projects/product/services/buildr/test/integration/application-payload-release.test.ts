import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildApplicationPayload } from '../../tools/release/application-payload.ts';
import { createNpmPackStaging, createReleaseArtifact, npmBinSource, readReleaseArtifact } from '../../tools/release/release-artifact.ts';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { createInstallationOrigin } from '../../src/system/installation/infrastructure/installation-origin.ts';
import { GENERATED_USER_REGISTRY_RESOURCE_SOURCES } from '../../src/infrastructure/product-layout.ts';
import { verifyApplicationPayload } from '../../src/infrastructure/product-resources/index.ts';
import { readSharedCandidatePackage } from '../verification/release/candidate-package.ts';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.ts';

const SOURCE_COMMIT: any = 'b'.repeat(40);
const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const testContextConsumerFixture: any = path.join(serviceRoot, 'test/fixtures/test-context-consumer');

function npmCliForCurrentNode(): any  {
  const executableDirectory: any = path.dirname(process.execPath);
  const candidates: any = [
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

function runNpm(args: any, options: any): any  {
  return spawnSync(process.execPath, [npmCliForCurrentNode(), ...args], options);
}

async function candidateArtifact(root: any): Promise<any>  {
  const shared: any = readSharedCandidatePackage();
  if (shared?.manifest) return {
    artifact: { tarball: shared.tarball, manifestPath: shared.manifestPath, manifest: shared.manifest },
    payloadDigest: shared.manifest.applicationPayloadDigest,
  };
  const generated: any = createGeneratedReleaseInputs(path.join(root, 'generated'), SOURCE_COMMIT);
  const payload: any = await buildApplicationPayload(path.join(root, 'payload'), SOURCE_COMMIT, { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
  return {
    artifact: createReleaseArtifact(payload.root, path.join(root, 'artifact'), { testContextRoot: generated.testContextRoot }),
    payloadDigest: payload.manifest.applicationPayloadDigest,
  };
}

test('same inputs create byte-identical payload and installed resource mapping detects drift', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-application-payload-'));
  try {
    const firstInputs: any = createGeneratedReleaseInputs(path.join(root, 'first-inputs'), SOURCE_COMMIT);
    const secondInputs: any = createGeneratedReleaseInputs(path.join(root, 'second-inputs'), SOURCE_COMMIT);
    const first: any = await buildApplicationPayload(path.join(root, 'first'), SOURCE_COMMIT, { generatedArtifactManifest: firstInputs.manifest, webDistRoot: firstInputs.webDistRoot });
    const second: any = await buildApplicationPayload(path.join(root, 'second'), SOURCE_COMMIT, { generatedArtifactManifest: secondInputs.manifest, webDistRoot: secondInputs.webDistRoot });
    assert.deepEqual(first.manifest, second.manifest);
    assert.deepEqual(fs.readFileSync(path.join(first.root, 'runtime/buildr.cjs')), fs.readFileSync(path.join(second.root, 'runtime/buildr.cjs')));
    assert.deepEqual(first.manifest.files.filter((entry: any) => entry.path.includes('/installation/launcher/')).map((entry: any) => entry.path), [
      'resources/product/resources/installation/launcher/Buildr.icns',
      'resources/product/resources/installation/launcher/Buildr.ico',
    ]);
    assert.equal(first.manifest.files.some((entry: any) => entry.path.endsWith('.map')), false);
    assert.equal(first.manifest.files.some((entry: any) => entry.path.endsWith('.ts')), false);
    assert.equal(first.manifest.files.some((entry: any) => /(?:^|\/)typescript(?:\/|$)/u.test(entry.path)), false);
    assert.equal(first.manifest.files.some((entry: any) => /(?:^|\/)@types\/node(?:\/|$)/u.test(entry.path)), false);
    assert.equal(first.manifest.files.some((entry: any) => entry.path.endsWith('/web-dist/index.html')), true);
    assert.equal(first.manifest.files.some((entry: any) => entry.path.endsWith('/preparation.yml')), false);
    assert.equal(first.manifest.files.some((entry: any) => entry.path.includes('/services/buildr-web/')), false);
    assert.equal(first.manifest.files.some((entry: any) => entry.path.includes('/node_modules/typescript/')), false);
    assert.equal(first.manifest.files.some((entry: any) => entry.path.includes('/sqlite/migrations/0000_')), true);
    for (const relativePath of GENERATED_USER_REGISTRY_RESOURCE_SOURCES) {
      assert.equal(first.manifest.files.some((entry: any) => entry.path === `resources/product/${relativePath}`), false, relativePath);
    }
    const runtimeMetadata: any = JSON.parse(fs.readFileSync(path.join(first.root, 'resources/product/package.json'), 'utf8'));
    assert.equal(runtimeMetadata.devDependencies, undefined);
    assert.equal(runtimeMetadata.scripts, undefined);
    assert.deepEqual(Object.keys(runtimeMetadata.dependencies), ['ajv', 'yaml']);
    assert.equal(runtimeMetadata.devDependencies, undefined);

    const staging: any = createNpmPackStaging(first.root, path.join(root, 'npm-staging'), { testContextRoot: firstInputs.testContextRoot });
    assert.equal(verifyApplicationPayload(staging.root, { layout: 'installed' }).manifest.applicationPayloadDigest, first.manifest.applicationPayloadDigest);
    fs.appendFileSync(path.join(staging.root, 'payload/product/web-dist/index.html'), 'drift');
    assert.throws(() => verifyApplicationPayload(staging.root, { layout: 'installed' }), /digest mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('same generated inputs create byte-identical npm Candidate and reject unbound local output', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-generated-candidate-repeat-'));
  try {
    const firstInputs: any = createGeneratedReleaseInputs(path.join(root, 'first-inputs'), SOURCE_COMMIT);
    const secondInputs: any = createGeneratedReleaseInputs(path.join(root, 'second-inputs'), SOURCE_COMMIT);
    const firstPayload: any = await buildApplicationPayload(path.join(root, 'first-payload'), SOURCE_COMMIT, { generatedArtifactManifest: firstInputs.manifest, webDistRoot: firstInputs.webDistRoot });
    const secondPayload: any = await buildApplicationPayload(path.join(root, 'second-payload'), SOURCE_COMMIT, { generatedArtifactManifest: secondInputs.manifest, webDistRoot: secondInputs.webDistRoot });
    const first: any = createReleaseArtifact(firstPayload.root, path.join(root, 'first-artifact'), { testContextRoot: firstInputs.testContextRoot });
    const second: any = createReleaseArtifact(secondPayload.root, path.join(root, 'second-artifact'), { testContextRoot: secondInputs.testContextRoot });
    assert.equal(first.manifest.generatedArtifactIdentity, second.manifest.generatedArtifactIdentity);
    assert.equal(first.manifest.applicationPayloadDigest, second.manifest.applicationPayloadDigest);
    assert.equal(first.manifest.sha256, second.manifest.sha256);

    const staleInputs: any = createGeneratedReleaseInputs(path.join(root, 'stale-inputs'), SOURCE_COMMIT);
    fs.appendFileSync(path.join(staleInputs.webDistRoot, 'index.html'), 'stale');
    await assert.rejects(
      buildApplicationPayload(path.join(root, 'forbidden-payload'), SOURCE_COMMIT, { generatedArtifactManifest: staleInputs.manifest, webDistRoot: staleInputs.webDistRoot }),
      /generated_artifact_bytes_mismatch: web-dist/,
    );
    assert.equal(fs.existsSync(path.join(root, 'forbidden-payload')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('payload verify runs from a clean tree with no node_modules or esbuild', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-payload-clean-verify-'));
  try {
    const generated: any = createGeneratedReleaseInputs(path.join(root, 'generated'), SOURCE_COMMIT);
    const payload: any = await buildApplicationPayload(path.join(root, 'payload'), SOURCE_COMMIT, { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
    const cleanRoot: any = path.join(root, 'clean-service');
    for (const relative of [
      'tools/release/application-payload.ts',
      'tools/build/generated-artifacts.ts',
      'src/infrastructure/product-resources/index.ts',
      'src/infrastructure/filesystem/filesystem-path-identity.ts',
    ]) {
      const target: any = path.join(cleanRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(serviceRoot, relative), target);
    }
    assert.equal(fs.existsSync(path.join(cleanRoot, 'node_modules')), false);
    const result: any = spawnSync(process.execPath, [
      path.join(cleanRoot, 'tools/release/application-payload.ts'),
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
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-payload-'));
  try {
    const { artifact, payloadDigest }: any = await candidateArtifact(root);
    const readback: any = readReleaseArtifact(artifact.manifestPath, {
      packageName: '@buildr-ai/buildr',
      version: artifact.manifest.version,
      applicationPayloadDigest: payloadDigest,
    });
    assert.equal(readback.tarball, artifact.tarball);
    assert.match(artifact.manifest.generatedArtifactIdentity, /^sha256-[a-f0-9]{64}$/);
    const paths: any = artifact.manifest.inventory.map((entry: any) => entry.path);
    for (const required of [
      'runtime/buildr.cjs',
      'scripts/postinstall.mjs',
      'test-context.mjs',
      'package/targets/test-context/index.js',
      'package/targets/test-context/index.d.ts',
      'payload/runtime/read-worker.cjs',
      'payload/product/web-dist/index.html',
      'payload/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
      'payload/product/resources/manifest.yml',
      'payload/product/resources/installation/launcher/Buildr.icns',
      'payload/product/resources/installation/launcher/Buildr.ico',
    ]) assert.equal(paths.includes(required), true, required);
    assert.equal(paths.some((value: any) => /(^|\/)node(?:\.exe)?(\/|$)/iu.test(value)), false);
    assert.equal(paths.some((value: any) => value.endsWith('/preparation.yml')), false);
    assert.equal(paths.some((value: any) => value.includes('/services/buildr-web/')), false);
    assert.equal(paths.some((value: any) => value.includes('/node_modules/typescript/')), false);
    assert.deepEqual(paths.filter((value: any) => /(^|\/)launchers?(\/|$)/iu.test(value)), [
      'payload/product/resources/installation/launcher/Buildr.icns',
      'payload/product/resources/installation/launcher/Buildr.ico',
    ]);
    assert.equal(paths.some((value: any) => /\.(?:app|pkg|msi|map)$/iu.test(value)), false);
    assert.equal(paths.some((value: any) => value.endsWith('.ts') && !value.endsWith('.d.ts')), false);
    assert.equal(paths.some((value: any) => /(?:^|\/)typescript(?:\/|$)/u.test(value)), false);
    assert.equal(paths.some((value: any) => /(?:^|\/)@types\/node(?:\/|$)/u.test(value)), false);
    for (const relativePath of GENERATED_USER_REGISTRY_RESOURCE_SOURCES) {
      assert.equal(paths.includes(`payload/product/${relativePath}`), false, relativePath);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('installed Candidate exposes the same Test Context ESM and strict TypeScript contract', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-test-context-'));
  try {
    const { artifact }: any = await candidateArtifact(root);
    const consumerRoot: any = path.join(root, 'consumer');
    fs.mkdirSync(consumerRoot, { recursive: true });
    for (const file of ['consumer.ts', 'runtime.mjs', 'tsconfig.json']) {
      fs.copyFileSync(path.join(testContextConsumerFixture, file), path.join(consumerRoot, file));
    }
    fs.writeFileSync(path.join(consumerRoot, 'package.json'), '{"type":"module"}\n');
    const installed: any = runNpm(['install', '--offline', '--ignore-scripts', '--prefix', consumerRoot, artifact.tarball], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter),
        npm_config_cache: path.join(root, 'npm-cache'),
        npm_config_update_notifier: 'false',
      },
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);

    const runtime: any = spawnSync(process.execPath, [path.join(consumerRoot, 'runtime.mjs')], { cwd: consumerRoot, encoding: 'utf8' });
    assert.equal(runtime.status, 0, runtime.stderr || runtime.stdout);
    const types: any = spawnSync(process.execPath, [
      path.join(serviceRoot, 'node_modules/typescript/bin/tsc'),
      '--project', path.join(consumerRoot, 'tsconfig.json'),
      '--typeRoots', path.join(serviceRoot, 'node_modules/@types'),
    ], { cwd: consumerRoot, encoding: 'utf8' });
    assert.equal(types.status, 0, types.stderr || types.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('formal npm entry fails closed before enrollment when receipt and payload identities diverge', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-origin-mismatch-'));
  try {
    const { artifact }: any = await candidateArtifact(root);
    const prefix: any = path.join(root, 'prefix');
    const appData: any = path.join(root, 'app-data');
    const installed: any = runNpm(['install', '--offline', '--ignore-scripts', '--global', '--prefix', prefix, artifact.tarball], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter),
        npm_config_cache: path.join(root, 'npm-cache'),
        npm_config_update_notifier: 'false',
      },
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    const modules: any = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
    const packageRoot: any = path.join(modules, '@buildr-ai/buildr');
    const originPath: any = path.join(packageRoot, 'installation-origin.json');
    const matching: any = JSON.parse(fs.readFileSync(originPath, 'utf8'));
    const mismatched: any = createInstallationOrigin({ ...matching, applicationPayloadDigest: `sha256-${'f'.repeat(64)}` });
    fs.writeFileSync(originPath, `${JSON.stringify(mismatched, null, 2)}\n`);

    const result: any = spawnSync(process.execPath, [path.join(packageRoot, 'bin/buildr.mjs'), '--help'], {
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
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-postinstall-'));
  try {
    const { artifact }: any = await candidateArtifact(root);
    const appData: any = path.join(root, 'app-data');
    const npmCache: any = path.join(root, 'npm-cache');
    const prefixes: any[] = [path.join(root, 'prefix-a'), path.join(root, 'prefix-b')];
    const entries: any[] = [];
    for (const prefix of prefixes) {
      const installed: any = runNpm(['install', '--offline', '--global', '--prefix', prefix, artifact.tarball], {
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
      const modules: any = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
      entries.push(path.join(modules, '@buildr-ai/buildr', 'bin/buildr.mjs'));
    }
    const registryFile: any = path.join(appData, 'product-installations.json');
    const registry: any = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    assert.equal(registry.installations.length, 2);
    for (const [index, installation] of registry.installations.entries()) {
      assert.equal(installation.origin.channel, 'npm');
      assert.equal(installation.updateAuthority.type, 'npm-cli');
      assert.equal(sameFilesystemPath(installation.updateAuthority.nodeExecutable, process.execPath), true);
      assert.equal(sameFilesystemPath(installation.updateAuthority.prefix, prefixes[index]), true);
      assert.equal(fs.statSync(installation.updateAuthority.npmCliPath).isFile(), true);
      assert.equal(sameFilesystemPath(installation.entryPath, entries[index]), true);
    }
    const bytes: any = fs.readFileSync(registryFile, 'utf8');
    for (const entry of entries) {
      const help: any = spawnSync(process.execPath, [entry, '--help'], {
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
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-installed-'));
  const appData: any = path.join(root, 'app-data');
  let web: any = null;
  try {
    const { artifact, payloadDigest }: any = await candidateArtifact(root);
    const prefix: any = path.join(root, 'prefix');
    const npmCache: any = path.join(root, 'npm-cache');
    const installed: any = runNpm(['install', '--offline', '--ignore-scripts', '--global', '--prefix', prefix, artifact.tarball], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter),
        npm_config_cache: npmCache,
        npm_config_update_notifier: 'false',
      },
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    const modules: any = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
    const packageRoot: any = path.join(modules, '@buildr-ai/buildr');
    const cli: any = path.join(packageRoot, 'bin/buildr.mjs');
    const runtimeEnv: any = {
      ...process.env,
      PATH: process.platform === 'win32' ? process.env.SystemRoot : '/usr/bin:/bin',
      NODE_PATH: '',
      BUILDR_APP_DATA_DIR: appData,
      BUILDR_PRODUCT_DATA_DIR: appData,
    };
    const run: any = (args: any) => spawnSync(process.execPath, [cli, ...args], { cwd: root, env: runtimeEnv, encoding: 'utf8' });
    const help: any = run(['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage: buildr/);
    const developmentSchema: any = run(['__internal', 'task-development', 'planning', '--schema']);
    assert.notEqual(developmentSchema.status, 0, 'retired Task Development route must be absent');
    assert.equal(fs.existsSync(path.join(packageRoot, 'src/task/interfaces/internal/task-development-driver.mjs')), false);
    assert.equal(fs.existsSync(path.join(packageRoot, 'src/task/interfaces/internal/task-retrospective-driver.mjs')), false);
    assert.equal(fs.existsSync(path.join(packageRoot, 'src/task/interfaces/internal/task-planning-identity-driver.mjs')), false);

    const workflowWorkspace: any = path.join(root, 'workflow-workspace');
    fs.mkdirSync(workflowWorkspace);
    const initialized: any = run(['init', '--target', workflowWorkspace, '--name', 'workflow-route-fixture', '--profile', 'team']);
    assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
    const project: any = run(['project', 'create', 'demo', '--target', workflowWorkspace, '--name', 'Demo', '--description', 'Installed workflow route fixture.']);
    assert.equal(project.status, 0, project.stderr || project.stdout);
    const planningIdentity: any = run(['__internal', 'task-planning-identity', 'inspect', '--task', 'planning-route-fixture', '--target', workflowWorkspace]);
    assert.notEqual(planningIdentity.status, 0, 'retired Planning Identity route must be absent');

    const retrospective: any = run(['__internal', 'task-retrospective', 'record', '--task', 'retrospective-route-fixture', '--target', workflowWorkspace, '--report-markdown', '# Installed route fixture\n\nThe bundled Retrospective writer reached the canonical Application.']);
    assert.notEqual(retrospective.status, 0, 'retired Task Retrospective internal route must be absent');
    assert.equal(fs.existsSync(path.join(packageRoot, 'payload/product/resources/workspace/skills/buildr/task-retrospective/SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(appData, 'instance.json')), false, 'ordinary CLI must not start HTTP');
    const installationRegistryFile: any = path.join(appData, 'product-installations.json');
    const firstRegistryBytes: any = fs.readFileSync(installationRegistryFile, 'utf8');
    const installationRegistry: any = JSON.parse(firstRegistryBytes);
    assert.equal(installationRegistry.schemaVersion, 'buildr.product-installation-registry/v1');
    assert.equal(installationRegistry.installations.length, 1);
    assert.equal(installationRegistry.installations[0].origin.channel, 'npm');
    assert.equal(sameFilesystemPath(installationRegistry.installations[0].entryPath, cli), true);
    assert.equal(installationRegistry.installations[0].runtime.executable, process.execPath);
    assert.equal(installationRegistry.installations[0].updateAuthority, null);
    const guide: any = run(['bootstrap', 'guide']);
    assert.equal(guide.status, 0, guide.stderr);
    assert.equal(fs.readFileSync(installationRegistryFile, 'utf8'), firstRegistryBytes, 'formal startup enrollment must be byte-idempotent');
    const installationStatus: any = run(['installation', 'status', '--json']);
    assert.equal(installationStatus.status, 0, installationStatus.stderr);
    const installation: any = JSON.parse(installationStatus.stdout);
    assert.equal(installation.channels.npm.status, 'current');
    assert.equal(installation.currentInstallation.channel, 'npm');
    assert.equal(installation.installationRegistry.status, 'ready');
    const identityResult: any = run(['version', '--json']);
    assert.equal(identityResult.status, 0, identityResult.stderr);
    const identity: any = JSON.parse(identityResult.stdout);
    assert.equal(identity.channel, 'npm');
    assert.equal(identity.runtime.role, 'host');
    assert.equal(identity.runtime.executable, process.execPath);
    assert.equal(identity.applicationPayloadDigest, payloadDigest);

    web = spawn(process.execPath, [cli, 'web', '--no-open', '--port', '0'], { cwd: root, env: runtimeEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr: any = '';
    web.stderr.setEncoding('utf8');
    web.stderr.on('data', (chunk: any) => { stderr += chunk; });
    let instance: any = null;
    for (let attempt: any = 0; attempt < 100; attempt += 1) {
      try { instance = JSON.parse(fs.readFileSync(path.join(appData, 'instance.json'), 'utf8')); } catch {}
      if (instance) break;
      if (web.exitCode !== null) break;
      await new Promise((resolve: any) => setTimeout(resolve, 50));
    }
    assert.ok(instance, `Buildr Web did not create readiness identity: ${stderr}`);
    const health: any = await fetch(`${instance.url}/api/v1/health`, { headers: { 'x-buildr-instance': instance.secret } });
    assert.equal(health.status, 200);
    const healthIdentity: any = await health.json();
    assert.equal(healthIdentity.schemaVersion, 'buildr.local-app-health/v1');
    assert.equal(healthIdentity.status, 'ready');
    assert.equal(healthIdentity.pid, web.pid);
    assert.equal(healthIdentity.launcherIdentity, null);
    assert.equal(healthIdentity.previewIdentity, null);
    assert.equal(healthIdentity.productIdentity.channel, 'npm');
    assert.equal(healthIdentity.productIdentity.runtime.role, 'host');
    assert.equal(healthIdentity.productIdentity.applicationPayloadDigest, payloadDigest);
    assert.equal(instance.productIdentity.installationIdentity, healthIdentity.productIdentity.installationIdentity);
    const shell: any = await fetch(instance.url);
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /<div id="root"><\/div>/);
  } finally {
    if (web && web.exitCode === null) {
      web.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve: any) => web.once('close', resolve)),
        new Promise((resolve: any) => setTimeout(resolve, 2_000)),
      ]);
      if (web.exitCode === null) web.kill('SIGKILL');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npm thin entry rejects an incompatible host before loading Buildr', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-engine-'));
  try {
    const source: any = npmBinSource().replace('process.versions.node', "'23.99.0'");
    const entry: any = path.join(root, 'buildr.mjs');
    fs.writeFileSync(entry, source);
    const result: any = spawnSync(process.execPath, [entry, '--help'], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, />=24\.15\.0 <25/);
    assert.doesNotMatch(result.stderr, /module|payload|download failed/iu);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
