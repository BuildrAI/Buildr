import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectSourceInstallation, parseSourceObservations, parseSourceQueryResult, queryAssetSources } from '../../plugin/source-process.ts';
import { fileDigest } from '../../plugin/process.ts';
import type { SourceObservations } from '../../plugin/src/source-types.ts';

const sha = 'sha256-' + 'a'.repeat(64);
const input: SourceObservations = { schemaVersion: 'buildr.agent-asset-source-observations/v1', observations: [{ id: 'record:1', type: 'file', locator: { path: '/workspace/AGENTS.md' } }] };
function response(): any {
  return {
    schemaVersion: 'buildr.agent-asset-source-result/v1', workspace: { id: 'workspace-A', scope: '.' }, effects: [],
    items: [{ id: 'record:1', status: 'detected', diagnostic: null, mixed: true, objects: [{
      identity: 'core-rule', kind: 'rule', workspaceId: 'workspace-A', scope: '.', providedBy: 'buildr', managedBy: 'buildr',
      selector: { path: 'AGENTS.md', version: 1 }, current: { content: 'current', digest: sha }, observed: {}, historical: 'unknown',
      evidence: [{ authority: 'managed-block', locator: 'AGENTS.md', digest: sha }], selection: { startOffset: 0, endOffset: 7, unit: 'utf16' },
    }] }],
  };
}

async function processFixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-source-unit-'));
  const absoluteRoot = await fs.realpath(root);
  t.after(async () => {
    assert.equal(await fs.realpath(root), absoluteRoot);
    await fs.rm(absoluteRoot, { recursive: true, force: true });
  });
  const nodeExecutable = path.join(absoluteRoot, 'node fixture');
  const cliEntry = path.join(absoluteRoot, 'CLI fixture.mjs');
  await fs.writeFile(nodeExecutable, 'node fixture');
  await fs.writeFile(cliEntry, 'CLI fixture A');
  const binding = { nodeExecutable, cliEntry, nodeSha256: await fileDigest(nodeExecutable), cliSha256: await fileDigest(cliEntry) };
  const status = { schemaVersion: 'buildr.installation-status/v1', channels: {
    npm: { status: 'installed', identity: { ownershipIdentity: 'npm-A', version: '1', protocolIdentity: 'v1', package: '@buildr-ai/buildr', channel: 'npm' } },
  } };
  return { root: absoluteRoot, binding, status };
}

test('recorded command proof validates one current installation and never executes the original capability', async t => {
  const { binding, status } = await processFixture(t);
  let statusReads = 0;
  const installed = await inspectSourceInstallation(binding, 'npm', new AbortController().signal, {
    exec: async (_file, args) => { statusReads++; assert.ok(args.includes('installation')); return { stdout: JSON.stringify(status) }; },
    runInput: () => assert.fail('installation proof must not execute a source query or recorded capability'),
  });
  assert.deepEqual(installed.prefixes, [[binding.nodeExecutable, binding.cliEntry], [binding.cliEntry]]);
  assert.equal(statusReads, 1);
  await fs.appendFile(binding.cliEntry, 'changed');
  await assert.rejects(inspectSourceInstallation(binding, 'npm', new AbortController().signal, { exec: () => assert.fail('drift must be rejected before status') }), { code: 'installation-drift' });
});

async function developmentEntryFixture(t: TestContext, mode: 'own' | 'foreign' | 'external-link') {
  const fixture = await processFixture(t);
  const sourceRoot = path.join(fixture.root, 'projects/product/services/buildr');
  const ownEntry = path.join(sourceRoot, 'bin/buildr.mjs');
  const foreignEntry = path.join(fixture.root, 'foreign-buildr/bin/buildr.mjs');
  const wrapper = path.resolve(sourceRoot, '../../buildr');
  await fs.mkdir(path.dirname(ownEntry), { recursive: true });
  await fs.mkdir(path.dirname(foreignEntry), { recursive: true });
  await fs.writeFile(wrapper, 'fixture wrapper');
  await fs.writeFile(foreignEntry, 'fixture CLI');
  if (mode === 'external-link') await fs.symlink(foreignEntry, ownEntry);
  else await fs.writeFile(ownEntry, 'fixture CLI');
  const cliEntry = mode === 'foreign' ? foreignEntry : ownEntry;
  const binding = { ...fixture.binding, cliEntry, cliSha256: await fileDigest(cliEntry) };
  const status = { schemaVersion: 'buildr.installation-status/v1', channels: {
    development: { status: 'current', identity: { ownershipIdentity: 'dev-A', version: '1', protocolIdentity: 'v1', sourceRoot },
      runtime: { executable: binding.nodeExecutable } },
  } };
  return { binding, status, wrapper };
}

test('development command proof recognizes the bound Node/bin only under the actual reported source identity', async t => {
  const { binding, status, wrapper } = await developmentEntryFixture(t, 'own');
  const result = await inspectSourceInstallation(binding, 'development', new AbortController().signal,
    { exec: async () => ({ stdout: JSON.stringify(status) }) });
  assert.deepEqual(result.prefixes, [[wrapper], [binding.nodeExecutable, binding.cliEntry]]);
  assert.equal(result.prefixes.some(prefix => prefix.length === 1 && prefix[0] === binding.cliEntry), false,
    'the direct executable bin is not newly permitted');
});

test('development command proof rejects a bound bin belonging to another source root', async t => {
  const { binding, status, wrapper } = await developmentEntryFixture(t, 'foreign');
  const result = await inspectSourceInstallation(binding, 'development', new AbortController().signal,
    { exec: async () => ({ stdout: JSON.stringify(status) }) });
  assert.deepEqual(result.prefixes, [[wrapper]]);
});

test('development command proof rejects an expected bin symlink escaping its reported source root', async t => {
  const { binding, status, wrapper } = await developmentEntryFixture(t, 'external-link');
  const result = await inspectSourceInstallation(binding, 'development', new AbortController().signal,
    { exec: async () => ({ stdout: JSON.stringify(status) }) });
  assert.deepEqual(result.prefixes, [[wrapper]]);
});

test('same-installation explicit aliases require the approved physical file and reject equal-byte copies or changed links', async t => {
  const { root, binding, status } = await processFixture(t);
  const alias = path.join(root, 'entry-alias'), copy = path.join(root, 'copied-entry');
  await fs.symlink(binding.cliEntry, alias); await fs.copyFile(binding.cliEntry, copy);
  const installed = await inspectSourceInstallation(binding, 'npm', new AbortController().signal, { exec: async () => ({ stdout: JSON.stringify(status) }) });
  assert.equal(await installed.verifyFile!(alias, binding.cliEntry), true);
  assert.equal(await installed.verifyFile!(copy, binding.cliEntry), false);
  await fs.unlink(alias); await fs.symlink(copy, alias);
  assert.equal(await installed.verifyFile!(alias, binding.cliEntry), false);
  await fs.appendFile(binding.cliEntry, 'changed after observation');
  await assert.rejects(installed.verifyFile!(binding.cliEntry, binding.cliEntry), { code: 'installation-drift' });
});

test('normal development status approves its own runtime without accepting npm CLI as a development prefix', async t => {
  const { binding, status, wrapper } = await developmentEntryFixture(t, 'foreign');
  const retainedNode = path.join(path.dirname(binding.nodeExecutable), 'retained-node'); await fs.writeFile(retainedNode, 'retained Node 24.15 fixture');
  status.channels.development.runtime.executable = retainedNode;
  const installed = await inspectSourceInstallation(binding, 'development', new AbortController().signal, { exec: async () => ({ stdout: JSON.stringify(status) }) });
  assert.deepEqual(installed.prefixes, [[wrapper]]); assert.deepEqual(installed.nodeExecutables, [binding.nodeExecutable, retainedNode]);
  assert.equal(await installed.verifyFile!(retainedNode, retainedNode), true);
});

test('source query reuses unchanged pinned file digests only within one request and never caches status', async t => {
  const { root, binding, status } = await processFixture(t);
  const hashes = new Map<string, number>();
  let installations = 0; let sources = 0;
  const dependencies = {
    digest: async (file: string) => { hashes.set(file, (hashes.get(file) ?? 0) + 1); return fileDigest(file); },
    exec: async () => { installations++; return { stdout: JSON.stringify(status) }; },
    runInput: async () => { sources++; return { stdout: JSON.stringify(response()) }; },
  };
  for (let i = 1; i <= 2; i++) {
    const result = await queryAssetSources(binding, 'npm', root, input, new AbortController().signal, dependencies);
    assert.equal(result.items[0].status, 'detected');
    assert.equal(hashes.get(binding.nodeExecutable), i);
    assert.equal(hashes.get(binding.cliEntry), i);
    assert.equal(installations, i); assert.equal(sources, i);
  }
});

test('source query invalidates digest reuse on same-size content drift even if mtime is restored', async t => {
  const { root, binding, status } = await processFixture(t);
  await fs.utimes(binding.cliEntry, 0, 0);
  const before = await fs.stat(binding.cliEntry, { bigint: true });
  let reads = 0;
  await assert.rejects(queryAssetSources(binding, 'npm', root, input, new AbortController().signal, {
    exec: async () => {
      await fs.writeFile(binding.cliEntry, 'CLI fixture B');
      await fs.utimes(binding.cliEntry, 0, 0);
      const after = await fs.stat(binding.cliEntry, { bigint: true });
      assert.equal(after.size, before.size); assert.equal(after.mtimeNs, before.mtimeNs);
      assert.notEqual(after.ctimeNs, before.ctimeNs);
      return { stdout: JSON.stringify(status) };
    },
    runInput: async () => { reads++; return { stdout: JSON.stringify(response()) }; },
  }), { code: 'installation-drift' });
  assert.equal(reads, 0);
});

test('a file changing during its digest read fails before either installation or source execution', async t => {
  const { root, binding, status } = await processFixture(t);
  let installations = 0; let sources = 0;
  await assert.rejects(queryAssetSources(binding, 'npm', root, input, new AbortController().signal, {
    digest: async file => {
      const result = await fileDigest(file);
      if (file === binding.cliEntry) await fs.appendFile(file, '\n');
      return result;
    },
    exec: async () => { installations++; return { stdout: JSON.stringify(status) }; },
    runInput: async () => { sources++; return { stdout: JSON.stringify(response()) }; },
  }), { code: 'installation-drift' });
  assert.equal(installations, 0); assert.equal(sources, 0);
});

test('source request parser matches v1 and preserves only supported fields', () => {
  assert.deepEqual(parseSourceObservations(input), input);
  for (const patch of [{ schemaVersion: 'v2' }, { observations: null }, { extra: 'private' }, { scope: '\0' }]) {
    assert.throws(() => parseSourceObservations({ ...input, ...patch }), { code: 'source-invalid-input' });
  }
  for (const observation of [
    { id: '', type: 'file' }, { id: 'x', type: 'command' }, { id: 'x', type: 'skill', locator: { extra: 'secret' } },
    { id: 'x', type: 'file', observedDigest: 'sha256-short' }, { id: 'x', type: 'file', observedContent: 'x\0y' },
    { id: 'x', type: 'capability', version: 0 }, { id: 'x', type: 'capability', version: 1.5 },
  ]) assert.throws(() => parseSourceObservations({ ...input, observations: [observation] }), { code: 'source-invalid-input' });
});

test('source requests have byte, text, item and identity bounds', () => {
  assert.throws(() => parseSourceObservations(input, 8), { code: 'source-invalid-input' });
  assert.throws(() => parseSourceObservations({ ...input, observations: Array.from({ length: 33 }, (_, i) => ({ id: '' + i, type: 'file' })) }), { code: 'source-invalid-input' });
  assert.throws(() => parseSourceObservations({ ...input, observations: [input.observations[0], input.observations[0]] }), { code: 'source-invalid-input' });
  assert.throws(() => parseSourceObservations({ ...input, observations: [{ id: 'a', type: 'file', observedContent: '字'.repeat(200_000) }] }), { code: 'source-invalid-input' });
});

test('source result parser handles nullable current content and discards unknown wire extensions', () => {
  const value = response();
  value.privateCredentials = 'private'; value.items[0].objects[0].privateCredentials = 'private';
  const result = parseSourceQueryResult(value, input);
  assert.equal(result.items[0].mixed, true);
  assert.equal(JSON.stringify(result).includes('private'), false);
  value.items[0].objects[0].current = null;
  assert.equal(parseSourceQueryResult(value, input).items[0].objects[0].current, null);
});

test('source result rejects write effects, unknown contract, missing or misbound item identities', () => {
  let value = response(); value.effects = [{ type: 'wrote-file' }];
  assert.throws(() => parseSourceQueryResult(value, input), { code: 'source-read-only-violation' });
  value = response(); value.schemaVersion = 'v2';
  assert.throws(() => parseSourceQueryResult(value, input), { code: 'source-unavailable' });
  for (const ids of [[], ['other'], ['record:1', 'record:1']]) {
    value = response(); value.items = ids.map(id => ({ ...value.items[0], id }));
    assert.throws(() => parseSourceQueryResult(value, input), { code: 'source-invalid-response' });
  }
});

test('source output validates object fields, digest and selection without trusting JSON', () => {
  for (const mutate of [
    (v: any) => { v.identity = 12; }, (v: any) => { v.kind = 'command'; },
    (v: any) => { v.providedBy = 'dsh'; }, (v: any) => { v.managedBy = 'external'; },
    (v: any) => { v.current.digest = 'sha256-short'; }, (v: any) => { v.observed.digest = 'secret'; },
    (v: any) => { v.historical = 'adopted'; }, (v: any) => { v.selector.path = { private: true }; },
    (v: any) => { v.selection.endOffset = -1; }, (v: any) => { v.selection.unit = 'bytes'; },
    (v: any) => { v.evidence = [{ authority: {}, locator: 'AGENTS.md' }]; },
  ]) {
    const value = response(); mutate(value.items[0].objects[0]);
    assert.throws(() => parseSourceQueryResult(value, input), { code: 'source-invalid-response' });
  }
});

test('public item errors expose only sanitized plugin messages', () => {
  const value = response();
  value.items[0].diagnostic = { code: 'source_not_found', message: 'credential=/private/secret?token=secret' };
  const result = parseSourceQueryResult(value, input);
  assert.equal(result.items[0].diagnostic?.code, 'source_not_found');
  assert.equal(JSON.stringify(result).includes('credential='), false);
});
