import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BUILDR_PROTOCOL_IDENTITY,
  createInstallationOrigin,
  readCurrentInstallationOrigin,
  validateFormalInstallationOriginPayloadBinding,
  validateInstallationOrigin,
} from '../../src/system/installation/infrastructure/installation-origin.ts';
import { currentProductInvocation, productInvocationArgs } from '../../src/infrastructure/product-invocation/index.ts';
import { canonicalApplicationPayloadIdentity } from '../../src/infrastructure/product-resources/index.ts';

function npmOrigin(version: any = '1.2.3'): any  {
  return createInstallationOrigin({
    channel: 'npm',
    runtimeRole: 'host',
    package: '@buildr-ai/buildr',
    version,
    protocolIdentity: BUILDR_PROTOCOL_IDENTITY,
    applicationPayloadDigest: `sha256-${'a'.repeat(64)}`,
    sourceCommit: 'b'.repeat(40),
    sourceTag: null,
    platform: null,
    architecture: null,
    nodeVersion: null,
    installUnit: `@buildr-ai/buildr@${version}`,
  });
}

function windowsPlatformOrigin(version: any = '1.2.3'): any  {
  return createInstallationOrigin({
    channel: 'platform',
    runtimeRole: 'product',
    package: '@buildr-ai/buildr',
    version,
    protocolIdentity: BUILDR_PROTOCOL_IDENTITY,
    applicationPayloadDigest: `sha256-${'a'.repeat(64)}`,
    sourceCommit: 'b'.repeat(40),
    sourceTag: `v${version}`,
    platform: 'windows',
    architecture: 'x64',
    nodeVersion: process.versions.node,
    installUnit: 'msi:9A188D6C-175E-4E43-A387-A7D2D09E3A51',
  });
}

function payloadManifest(origin: any): any  {
  const value: any = {
    schemaVersion: 'buildr.application-payload/v1',
    packageName: origin.package,
    buildrVersion: origin.version,
    protocolIdentity: origin.protocolIdentity,
    sourceCommit: origin.sourceCommit,
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
  value.applicationPayloadDigest = canonicalApplicationPayloadIdentity(value);
  return value;
}

function originForManifest(channel: any, manifest: any): any  {
  return createInstallationOrigin({
    channel,
    runtimeRole: channel === 'npm' ? 'host' : 'product',
    package: manifest.packageName,
    version: manifest.buildrVersion,
    protocolIdentity: manifest.protocolIdentity,
    applicationPayloadDigest: manifest.applicationPayloadDigest,
    sourceCommit: manifest.sourceCommit,
    sourceTag: channel === 'platform' ? `v${manifest.buildrVersion}` : null,
    platform: channel === 'platform' ? 'windows' : null,
    architecture: channel === 'platform' ? 'x64' : null,
    nodeVersion: channel === 'platform' ? process.versions.node : null,
    installUnit: channel === 'platform' ? 'msi:9A188D6C-175E-4E43-A387-A7D2D09E3A51' : `${manifest.packageName}@${manifest.buildrVersion}`,
  });
}

test('installation receipt is closed and detects ownership drift', () => {
  const origin: any = npmOrigin();
  assert.deepEqual(validateInstallationOrigin(origin), origin);
  assert.throws(() => validateInstallationOrigin({ ...origin, path: '/guessed' }), /fields must be closed/);
  assert.throws(() => validateInstallationOrigin({ ...origin, version: '9.9.9' }), /ownership identity mismatch/);
});

test('formal origin is bound to all payload identity fields while development remains payload-independent', () => {
  const initial: any = npmOrigin();
  const manifest: any = payloadManifest(initial);
  const matching: any = originForManifest('npm', manifest);
  assert.equal(validateFormalInstallationOriginPayloadBinding(matching, manifest).ownershipIdentity, matching.ownershipIdentity);
  const mismatched: any = createInstallationOrigin({ ...matching, applicationPayloadDigest: `sha256-${'f'.repeat(64)}` });
  assert.throws(
    () => validateFormalInstallationOriginPayloadBinding(mismatched, manifest),
    /applicationPayloadDigest: receipt=.*payload=/,
  );
  const development: any = createInstallationOrigin({
    channel: 'development', runtimeRole: 'development', package: '@buildr-ai/buildr', version: '1.2.3',
    protocolIdentity: BUILDR_PROTOCOL_IDENTITY, applicationPayloadDigest: null, sourceCommit: 'd'.repeat(40), sourceTag: null,
    platform: null, architecture: null, nodeVersion: null, installUnit: '/tmp/buildr-development',
  });
  assert.equal(validateFormalInstallationOriginPayloadBinding(development, null).channel, 'development');
});

test('npm origin is read only from its explicit payload envelope receipt', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-origin-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productRoot: any = path.join(root, 'payload', 'product');
  fs.mkdirSync(productRoot, { recursive: true });
  fs.writeFileSync(path.join(productRoot, 'package.json'), '{"name":"@buildr-ai/buildr","version":"1.2.3"}\n');
  assert.equal(readCurrentInstallationOrigin(productRoot, { payloadRoot: root }).channel, 'unknown');
  const manifest: any = payloadManifest(npmOrigin());
  const boundOrigin: any = originForManifest('npm', manifest);
  fs.writeFileSync(path.join(root, 'application-payload.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'installation-origin.json'), `${JSON.stringify(boundOrigin, null, 2)}\n`);
  const origin: any = readCurrentInstallationOrigin(productRoot, { payloadRoot: root });
  assert.equal(origin.channel, 'npm');
  assert.equal(origin.receipt.authority, 'payload-envelope');
  fs.writeFileSync(path.join(root, 'installation-origin.json'), `${JSON.stringify(npmOrigin(), null, 2)}\n`);
  const mismatched: any = readCurrentInstallationOrigin(productRoot, { payloadRoot: root });
  assert.equal(mismatched.channel, 'unknown');
  assert.match(mismatched.blockingReasons.join('\n'), /applicationPayloadDigest/);
  fs.renameSync(path.join(root, 'installation-origin.json'), path.join(productRoot, 'guessed-installation-origin.json'));
  assert.equal(readCurrentInstallationOrigin(productRoot, { payloadRoot: root }).channel, 'unknown');
});

test('formal installation origin rejects the retired platform channel', () => {
  assert.throws(() => createInstallationOrigin({ ...npmOrigin(), channel: 'platform', runtimeRole: 'product' }), /Unsupported installation channel: platform/);
});

test('product invocation always uses explicit Host or development Node without PATH lookup', () => {
  const host: any = currentProductInvocation({ cliPath: '/immutable/runtime/buildr.cjs', kind: 'host-node' });
  assert.deepEqual(productInvocationArgs(host, ['web', '--no-open']), [
    process.execPath,
    ['/immutable/runtime/buildr.cjs', 'web', '--no-open'],
  ]);
  assert.deepEqual(currentProductInvocation({ env: { BUILDR_NPM_ENTRY_PATH: '/npm/bin/buildr.mjs' } }), {
    command: process.execPath,
    argsPrefix: ['/npm/bin/buildr.mjs'],
    kind: 'host-node',
  });
  assert.throws(() => currentProductInvocation({ env: {}, argv: ['node', '/repo/test/task-finish-retained-cleanup.test.mjs'] }), /cannot infer a Node test entry/);
});
