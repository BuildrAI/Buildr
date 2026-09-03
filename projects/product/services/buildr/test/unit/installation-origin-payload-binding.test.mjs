import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInstallationOrigin,
  validateFormalInstallationOriginPayloadBinding,
} from '../../src/system/installation/infrastructure/installation-origin.ts';
import { canonicalApplicationPayloadIdentity } from '../../src/infrastructure/product-resources/index.ts';

function manifest() {
  const value = {
    schemaVersion: 'buildr.application-payload/v1',
    packageName: '@buildr-ai/buildr',
    buildrVersion: '1.2.3',
    protocolIdentity: 'buildr.web-protocol/v1',
    sourceCommit: 'a'.repeat(40),
    enginesNode: '>=24.15.0 <25',
    productionDependencies: [],
    files: [
      'resources/product/package.json',
      'resources/product/resources/manifest.yml',
      'resources/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
      'resources/product/web-dist/index.html',
      'resources/runtime/read-worker.cjs',
      'runtime/buildr.cjs',
    ].map((file) => ({ path: file, mode: 0o644, size: 0, sha256: '0'.repeat(64) })),
  };
  value.applicationPayloadDigest = canonicalApplicationPayloadIdentity(value);
  return value;
}

function formalOrigin(payload) {
  return createInstallationOrigin({
    channel: 'npm',
    runtimeRole: 'host',
    package: payload.packageName,
    version: payload.buildrVersion,
    protocolIdentity: payload.protocolIdentity,
    applicationPayloadDigest: payload.applicationPayloadDigest,
    sourceCommit: payload.sourceCommit,
    sourceTag: null,
    platform: null,
    architecture: null,
    nodeVersion: null,
    installUnit: `${payload.packageName}@${payload.buildrVersion}`,
  });
}

test('formal installation origin requires the exact validated application payload identity', () => {
  const payload = manifest();
  const matching = formalOrigin(payload);
  assert.deepEqual(validateFormalInstallationOriginPayloadBinding(matching, payload), matching);

  const otherPayloadOrigin = createInstallationOrigin({
    ...matching,
    applicationPayloadDigest: `sha256-${'f'.repeat(64)}`,
    sourceCommit: 'b'.repeat(40),
  });
  assert.throws(
    () => validateFormalInstallationOriginPayloadBinding(otherPayloadOrigin, payload),
    (error) => /applicationPayloadDigest/.test(error.message) && /sourceCommit/.test(error.message),
  );
  assert.throws(() => validateFormalInstallationOriginPayloadBinding(matching, null), /requires an application payload manifest/);
});

test('development origin remains valid without an application payload', () => {
  const development = createInstallationOrigin({
    channel: 'development',
    runtimeRole: 'development',
    package: '@buildr-ai/buildr',
    version: '1.2.3',
    protocolIdentity: 'buildr.web-protocol/v1',
    applicationPayloadDigest: null,
    sourceCommit: 'a'.repeat(40),
    sourceTag: null,
    platform: null,
    architecture: null,
    nodeVersion: null,
    installUnit: '/tmp/buildr-development',
  });
  assert.deepEqual(validateFormalInstallationOriginPayloadBinding(development, null), development);
});
