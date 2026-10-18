import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { assertNpmUpdateHandoffTarget, readNpmUpdateHandoffInstallation, registeredNpmInstallationSlot } from '../../src/modules/installation/infrastructure/current-product-identity.ts';

function fixture() {
  const root = path.resolve('/isolated/npm-a/package');
  const origin = (version: string) => ({ channel: 'npm', package: '@buildr-ai/buildr', version, ownershipIdentity: `origin-${version}`, protocolIdentity: 'buildr.web-protocol/v1', applicationPayloadDigest: `payload-${version}`, sourceCommit: `source-${version}` });
  const entry = (version: string, productRoot = root) => ({ productRoot, entryPath: path.join(productRoot, 'bin/buildr.mjs'), envelopePath: path.join(productRoot, 'origin.json'), origin: origin(version), updateAuthority: { prefix: path.dirname(productRoot) }, runtime: { role: 'host', executable: process.execPath, identity: 'host-node' } });
  const old = entry('0.0.1');
  const current = entry('0.0.2');
  const registered = { status: 'ready', installations: [{ status: 'invalid', entry: old }, { status: 'installed', entry: current }] };
  const identity = (value: any) => ({ ...value.origin, installationIdentity: value.origin.ownershipIdentity, runtime: value.runtime });
  const options = { productRoot: root, registeredInstallations: registered, productIdentity: identity(current) };
  return { root, old, current, registered, identity, options, entry };
}

test('重新读取新版登记并从同物理槽位历史证明旧CLI归属', () => {
  const f = fixture();
  assert.equal(readNpmUpdateHandoffInstallation({ productRoot: f.root, expectedVersion: '0.0.2', previousInstallationIdentity: f.old.origin.ownershipIdentity }, f.options).entry, f.current);
  assert.equal(assertNpmUpdateHandoffTarget({ productIdentity: f.identity(f.old), launcherIdentity: null }, f.options), f.current);
  assert.throws(() => readNpmUpdateHandoffInstallation({ productRoot: f.root, expectedVersion: '0.0.3' }, f.options), { code: 'web_update_installation_changed' });
  assert.throws(() => assertNpmUpdateHandoffTarget({ productIdentity: { ...f.identity(f.old), applicationPayloadDigest: 'foreign' } }, f.options), { code: 'web_update_instance_ownership_conflict' });
});

test('同origin在两个prefix登记时不能按首条identity选槽位，旧CLI归属歧义保持现场', () => {
  const f = fixture();
  const foreignOld = f.entry('0.0.1', path.resolve('/isolated/npm-b/package'));
  const foreignCurrent = f.entry('0.0.2', path.resolve('/isolated/npm-b/package'));
  f.registered.installations.unshift({ status: 'invalid', entry: foreignOld }, { status: 'installed', entry: foreignCurrent });
  const selected = readNpmUpdateHandoffInstallation({ productRoot: f.root, expectedVersion: '0.0.2' }, f.options);
  assert.equal(selected.entry, f.current);
  assert.equal(selected.slot.slotIdentity, registeredNpmInstallationSlot(f.registered, f.current.origin.ownershipIdentity, f.current).slotIdentity);
  assert.equal(registeredNpmInstallationSlot(f.registered, f.current.origin.ownershipIdentity).slotIdentity, null);
  assert.throws(() => assertNpmUpdateHandoffTarget({ productIdentity: f.identity(f.old), launcherIdentity: null }, f.options), { code: 'web_update_instance_ownership_ambiguous' });
  assert.throws(() => assertNpmUpdateHandoffTarget({ productIdentity: f.identity(f.current), launcherIdentity: null }, f.options), { code: 'web_update_instance_ownership_ambiguous' });
});

test('同origin的外来CLI即使没有update authority仍构成归属歧义', () => {
  const f = fixture();
  const sameCoordinates = { ...f.old, updateAuthority: null };
  f.registered.installations.push({ status: 'invalid', entry: sameCoordinates } as any);
  assert.equal(assertNpmUpdateHandoffTarget({ productIdentity: f.identity(f.old), launcherIdentity: null }, f.options), f.current);
  const foreign = { ...f.entry('0.0.1', path.resolve('/isolated/ordinary-cli/package')), updateAuthority: null };
  f.registered.installations.push({ status: 'installed', entry: foreign } as any);
  assert.throws(() => assertNpmUpdateHandoffTarget({ productIdentity: f.identity(f.old), launcherIdentity: null }, f.options), { code: 'web_update_instance_ownership_ambiguous' });
});
