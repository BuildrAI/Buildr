import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  APPLICATION_PAYLOAD_PROTOCOL_IDENTITY,
  APPLICATION_PAYLOAD_SCHEMA_VERSION,
  canonicalApplicationPayloadIdentity,
  validateApplicationPayloadManifest,
} from '../../src/infrastructure/product-resources/index.ts';
import { createNpmInstallationOrigin } from '../../tools/release/release-artifact.ts';

function manifest(): any  {
  const requiredFiles: any[] = [
    'resources/licenses/yaml-LICENSE',
    'resources/product/package.json',
    'resources/product/resources/manifest.yml',
    'resources/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
    'resources/product/web-dist/index.html',
    'resources/runtime/read-worker.cjs',
    'runtime/buildr.cjs',
  ];
  const value: any = {
    schemaVersion: APPLICATION_PAYLOAD_SCHEMA_VERSION,
    packageName: '@buildr-ai/buildr',
    buildrVersion: '1.2.3',
    protocolIdentity: APPLICATION_PAYLOAD_PROTOCOL_IDENTITY,
    sourceCommit: 'a'.repeat(40),
    enginesNode: '>=24.15.0 <25',
    productionDependencies: [{ name: 'yaml', version: '2.9.0', license: 'ISC', licensePath: 'resources/licenses/yaml-LICENSE' }],
    files: requiredFiles.map((file: any, index: any) => ({
      path: file,
      mode: 0o644,
      size: index + 1,
      sha256: crypto.createHash('sha256').update(file).digest('hex'),
    })),
  };
  value.applicationPayloadDigest = canonicalApplicationPayloadIdentity(value);
  return value;
}

test('application payload manifest is closed, sorted, and canonically identified', () => {
  const valid: any = manifest();
  assert.equal(validateApplicationPayloadManifest(valid), valid);
  assert.throws(() => validateApplicationPayloadManifest({ ...valid, generatedAt: new Date().toISOString() }), /unsupported fields/);
  assert.throws(() => validateApplicationPayloadManifest({ ...valid, sourceCommit: '/absolute/checkout' }), /sourceCommit/);
  assert.throws(() => validateApplicationPayloadManifest({ ...valid, files: [...valid.files].reverse() }), /uniquely sorted/);
  assert.throws(() => validateApplicationPayloadManifest({ ...valid, applicationPayloadDigest: `sha256-${'0'.repeat(64)}` }), /canonical manifest/);
});

test('npm installation origin uses the stable closed ownership tuple', () => {
  const payload: any = manifest();
  const receipt: any = createNpmInstallationOrigin(payload);
  const { ownershipIdentity, ...identity }: any = receipt;
  const expected: any = `sha256-${crypto.createHash('sha256').update(Buffer.from(JSON.stringify(identity), 'utf8')).digest('hex')}`;
  assert.equal(ownershipIdentity, expected);
  assert.deepEqual(Object.keys(receipt), [
    'schemaVersion', 'channel', 'runtimeRole', 'package', 'version', 'protocolIdentity',
    'applicationPayloadDigest', 'sourceCommit', 'sourceTag', 'installUnit', 'ownershipIdentity',
  ]);
  assert.equal(receipt.channel, 'npm');
  assert.equal(receipt.runtimeRole, 'host');
  assert.equal('nodeVersion' in receipt, false);
});
