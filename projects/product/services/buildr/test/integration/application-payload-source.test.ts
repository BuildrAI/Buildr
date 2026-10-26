import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildApplicationPayload } from '../../../../../../skills/buildr-release/scripts/application-payload.ts';
import { createNpmPackStaging, npmBinSource, createReleaseArtifact } from '../../../../../../skills/buildr-release/scripts/release-artifact.ts';
import { GENERATED_USER_REGISTRY_RESOURCE_SOURCES } from '../../src/infrastructure/product-layout.ts';
import { verifyApplicationPayload } from '../../src/infrastructure/product-resources/index.ts';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.ts';
import { SOURCE_COMMIT, serviceRoot } from '../helpers/application-payload-release.ts';

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
    assert.equal(first.manifest.files.some((entry: any) => entry.path.endsWith('.ts') && !entry.path.endsWith('.d.ts')), false);
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
    assert.deepEqual(Object.keys(runtimeMetadata.dependencies), ['@buildr-ai/buildr-agent', '@vscode/ripgrep-universal', 'ajv', 'mysql2', 'node-sql-parser', 'yaml']);
    for(const target of ['darwin-arm64/rg','darwin-x64/rg','linux-x64/rg','linux-arm64/rg','win32-x64/rg.exe','win32-arm64/rg.exe'])assert.ok(first.manifest.files.some((entry:any)=>entry.path==='resources/runtime/ripgrep/'+target),target);
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
    const cleanWorkspace: any = path.join(root, 'clean-workspace');
    const cleanRoot: any = path.join(cleanWorkspace, 'projects/product/services/buildr');
    for (const relative of [
      '../../../../skills/buildr-release/scripts/application-payload.ts',
      '../../../../skills/buildr-release/scripts/package.json',
      'package.json',
      'tools/build/generated-artifacts.ts',
      'src/infrastructure/product-resources/index.ts',
      'src/infrastructure/filesystem/filesystem-path-identity.ts',
    ]) {
      const target: any = path.join(cleanRoot, relative);
      const ownedRelative = path.relative(root, target);
      assert.ok(ownedRelative && !ownedRelative.startsWith('..') && !path.isAbsolute(ownedRelative), `fixture write must stay inside its owned root: ${relative}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(serviceRoot, relative), target);
    }
    assert.equal(fs.existsSync(path.join(cleanRoot, 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(cleanWorkspace, 'node_modules')), false);
    assert.throws(() => createRequire(path.join(cleanRoot, 'package.json')).resolve('esbuild'), { code: 'MODULE_NOT_FOUND' });
    const result: any = spawnSync(process.execPath, [
      path.join(cleanRoot, '../../../../skills/buildr-release/scripts/application-payload.ts'),
      'verify', '--payload', payload.root, '--layout', 'frozen',
    ], {
      cwd: cleanRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NODE_PATH: '' },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).applicationPayloadDigest, payload.manifest.applicationPayloadDigest);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npm thin entry enforces the minimum without an upper major version limit', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-engine-'));
  try {
    const entry: any = path.join(root, 'bin/buildr.mjs');
    fs.mkdirSync(path.dirname(entry));
    fs.mkdirSync(path.join(root, 'runtime'));
    fs.writeFileSync(path.join(root, 'runtime/workspace-cli-router.cjs'), 'exports.dispatchWorkspaceCli = async () => false;\n');
    fs.writeFileSync(path.join(root, 'runtime/buildr.cjs'), "process.stdout.write('payload-loaded\\n');\n");
    for (const version of ['23.99.0', '24.14.9', '24.15.0', '24.21.0', '25.0.0', '26.0.0', '24.15.0-rc.1', '25.0.0-nightly', '024.15.0', '25.0']) {
      fs.writeFileSync(entry, npmBinSource().replace('process.versions.node', JSON.stringify(version)));
      const result: any = spawnSync(process.execPath, [entry, '--help'], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
      const supported = ['24.15.0', '24.21.0', '25.0.0', '26.0.0'].includes(version);
      assert.equal(result.status, supported ? 0 : 1, `${version}: ${result.stderr}`);
      if (supported) assert.equal(result.stdout, 'payload-loaded\n', version);
      else {
        assert.match(result.stderr, />=24\.15\.0/);
        assert.doesNotMatch(result.stderr, /module|payload|download failed/iu);
        assert.equal(result.stdout, '');
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npm thin entry delegates before the product engine check and installation environment injection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-routing-order-'));
  try {
    const entry = path.join(root, 'bin/buildr.mjs');
    fs.mkdirSync(path.dirname(entry));
    fs.mkdirSync(path.join(root, 'runtime'));
    fs.writeFileSync(entry, npmBinSource().replace('process.versions.node', JSON.stringify('20.0.0')));
    fs.writeFileSync(path.join(root, 'runtime/buildr.cjs'), 'throw new Error("wrong product runtime loaded");\n');
    fs.writeFileSync(path.join(root, 'runtime/workspace-cli-router.cjs'), `
exports.dispatchWorkspaceCli = async (argv, options) => {
  process.stdout.write(JSON.stringify({args: argv.slice(2), entry: options.entryPath, npmEntry: process.env.BUILDR_NPM_ENTRY_PATH ?? null, payload: process.env.BUILDR_APPLICATION_PAYLOAD_ROOT ?? null}));
  process.exitCode = 17;
  return true;
};
`);
    const env = { ...process.env };
    delete env.BUILDR_NPM_ENTRY_PATH;
    delete env.BUILDR_APPLICATION_PAYLOAD_ROOT;
    const result = spawnSync(process.execPath, [entry, 'future-command', '参数 with spaces'], { encoding: 'utf8', env });
    assert.equal(result.status, 17, result.stderr);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), { args: ['future-command', '参数 with spaces'], entry: fs.realpathSync(entry), npmEntry: null, payload: null });
    assert.doesNotMatch(npmBinSource({ workspaceRouting: false }), /workspace-cli-router|dispatchWorkspaceCli/);
    fs.writeFileSync(path.join(root, 'runtime/workspace-cli-router.cjs'), "exports.dispatchWorkspaceCli = async () => { throw Object.assign(new Error('registered source unavailable'), {code:'workspace_cli.development_unavailable', nextAction:'Restore the registered source.'}); };\n");
    const failed = spawnSync(process.execPath, [entry, 'version'], { encoding: 'utf8', env });
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, '');
    assert.match(failed.stderr, /workspace_cli\.development_unavailable/);
    assert.match(failed.stderr, /Restore the registered source\./);
    assert.doesNotMatch(failed.stderr, /requires a host Node|wrong product runtime/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
