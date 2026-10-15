import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { artifactFromTarball, observePublishedPackageArtifact, packageMetadataFromTarball, packageNames } from '../../tools/release/package-artifact-observation.ts';

const version = '0.1.0-rc.2';
const compatibility = { schemaVersion: 'buildr.package-compatibility/v1', provides: ['buildr.plugin.entry/v1'], requires: [] };
const metadata = { name: packageNames['dsh-plugin'], version, buildrCompatibility: compatibility };
const integrity = (bytes: Buffer) => 'sha512-' + crypto.createHash('sha512').update(bytes).digest('base64');
type Entry = { name: string; body?: string | Buffer; kind?: string; prefix?: string; size?: number };
function tarRecord(entry: Entry): Buffer {
  const body = Buffer.from(entry.body ?? ''), header = Buffer.alloc(512);
  const field = (text: string, offset: number, size: number) => header.write(text, offset, size, 'utf8');
  field(entry.name, 0, 100); field('0000644\0', 100, 8); field('0000000\0', 108, 8); field('0000000\0', 116, 8);
  field((entry.size ?? body.length).toString(8).padStart(11, '0') + '\0', 124, 12); field('00000000000\0', 136, 12);
  header.fill(32, 148, 156); field(entry.kind ?? '0', 156, 1); field('ustar\0', 257, 6); field('00', 263, 2);
  if (entry.prefix) field(entry.prefix, 345, 155);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  field(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512)]);
}
function tarball(entries: Entry[] = [{ name: 'package/package.json', body: JSON.stringify(metadata) }], trailer = Buffer.alloc(1024)): Buffer {
  return gzipSync(Buffer.concat([...entries.map(tarRecord), trailer]));
}
function paxPath(path: string): string {
  const entry = `path=${path}\n`;
  let size = Buffer.byteLength(entry) + 2;
  while (Buffer.byteLength(`${size} ${entry}`) !== size) size = Buffer.byteLength(`${size} ${entry}`);
  return `${size} ${entry}`;
}
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fetchFixture(bytes: Buffer, changes: any = {}): { fetchImpl: typeof fetch; calls: Array<{ url: string; options: any }> } {
  const calls: Array<{ url: string; options: any }> = [];
  const fetchImpl = (async (input: any, options: any) => {
    const url = String(input); calls.push({ url, options });
    if (url.endsWith('.tgz')) return changes.download ?? new Response(bytes);
    if (url.endsWith(encodeURIComponent(version))) return changes.endpoint ?? jsonResponse({ ...metadata, ...changes.registryMetadata,
      dist: { integrity: integrity(bytes), tarball: 'https://registry.npmjs.org/@buildr-ai/buildr-dsh-plugin/-/plugin.tgz', ...changes.dist } });
    return changes.packument ?? jsonResponse({ name: metadata.name, 'dist-tags': { latest: version } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('observed declaration and both digests come from the same official tarball bytes', async () => {
  const bytes = tarball(), fixture = fetchFixture(bytes, { registryMetadata: { buildrCompatibility: { ...compatibility, provides: ['registry.lie/v1'] } } });
  const result = await observePublishedPackageArtifact('dsh-plugin', { fetchImpl: fixture.fetchImpl });
  assert.equal(result.observation.status, 'present');
  if (result.observation.status !== 'present') assert.fail('fixture should be observed');
  assert.deepEqual(result.observation.artifact.compatibility, compatibility);
  assert.equal(result.observation.artifact.integrity, integrity(bytes));
  assert.equal(result.observation.artifact.artifactSha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(result.bytes, bytes);
  assert.equal(fixture.calls.length, 3);
  assert.ok(fixture.calls.every(call => new URL(call.url).origin === 'https://registry.npmjs.org'));
  assert.ok(fixture.calls.every(call => !call.options.headers?.authorization));
  assert.equal(fixture.calls[2]?.options.redirect, 'error');
});

test('exact SRI mismatch blocks before download; corrupt bytes cannot yield a present observation', async () => {
  const bytes = tarball(), fixture = fetchFixture(bytes);
  const frozen = await observePublishedPackageArtifact('dsh-plugin', { version, expectedIntegrity: integrity(Buffer.from('different frozen bytes')), fetchImpl: fixture.fetchImpl });
  assert.equal(frozen.observation.status, 'unknown'); assert.equal(fixture.calls.length, 1); assert.equal(frozen.bytes, undefined);
  const corrupt = fetchFixture(bytes, { download: new Response(tarball([{ name: 'package/package.json', body: JSON.stringify({ ...metadata, changed: true }) }])) });
  assert.equal((await observePublishedPackageArtifact('dsh-plugin', { version, fetchImpl: corrupt.fetchImpl })).observation.status, 'unknown');
  for (const value of ['sha256-' + 'a'.repeat(64), integrity(bytes).slice(0, -1), integrity(Buffer.from('wrong'))]) {
    assert.throws(() => artifactFromTarball(bytes, { origin: 'registry', packageName: metadata.name, version, integrity: value }), /integrity/);
  }
});

test('404 proves absence while permission failures, malformed responses and wrong metadata stay unknown', async () => {
  const bytes = tarball();
  for (const origin of ['packument', 'endpoint']) {
    const fixture = fetchFixture(bytes, { [origin]: new Response('', { status: 404 }) });
    const result = await observePublishedPackageArtifact('dsh-plugin', { ...(origin === 'endpoint' ? { version } : {}), fetchImpl: fixture.fetchImpl });
    assert.deepEqual(result.observation, { status: 'absent', packageName: metadata.name }); assert.equal(result.bytes, undefined);
  }
  for (const endpoint of [new Response('', { status: 403 }), new Response('bad JSON'), jsonResponse({ ...metadata, version: '0.1.0-rc.9' })]) {
    const fixture = fetchFixture(bytes, { endpoint });
    assert.equal((await observePublishedPackageArtifact('dsh-plugin', { version, fetchImpl: fixture.fetchImpl })).observation.status, 'unknown');
    assert.equal(fixture.calls.length, 1);
  }
});

test('official origin, redirect and content-length restrictions reject untrusted downloads', async () => {
  const bytes = tarball();
  for (const tarball of ['https://example.test/plugin.tgz', 'http://registry.npmjs.org/plugin.tgz', 'https://user:password@registry.npmjs.org/plugin.tgz']) {
    const fixture = fetchFixture(bytes, { dist: { tarball } });
    assert.equal((await observePublishedPackageArtifact('dsh-plugin', { version, fetchImpl: fixture.fetchImpl })).observation.status, 'unknown');
    assert.equal(fixture.calls.length, 1);
  }
  for (const download of [new Response('', { status: 302, headers: { location: 'https://example.test/plugin.tgz' } }),
    new Response(bytes, { headers: { 'content-length': String(256 * 1024 * 1024 + 1) } })]) {
    assert.equal((await observePublishedPackageArtifact('dsh-plugin', { version, fetchImpl: fetchFixture(bytes, { download }).fetchImpl })).observation.status, 'unknown');
  }
});

test('package identity, private metadata, malformed declarations and missing candidate source fail closed', () => {
  for (const changes of [{ name: packageNames.buildr }, { version: '0.1.0-rc.9' }, { private: true }, { buildrCompatibility: { schemaVersion: 'invalid' } }]) {
    const bytes = tarball([{ name: 'package/package.json', body: JSON.stringify({ ...metadata, ...changes }) }]);
    assert.throws(() => artifactFromTarball(bytes, { origin: 'registry', packageName: metadata.name, version, integrity: integrity(bytes) }));
  }
  const bytes = tarball();
  assert.throws(() => artifactFromTarball(bytes, { origin: 'candidate', packageName: metadata.name, version, integrity: integrity(bytes) }), /source identity/);
  const candidate = artifactFromTarball(bytes, { origin: 'candidate', packageName: metadata.name, version, integrity: integrity(bytes), sourceCommit: 'a'.repeat(40) });
  assert.equal(candidate.sourceCommit, 'a'.repeat(40)); assert.deepEqual(candidate.compatibility, compatibility);
  const legacy = tarball([{ name: 'package/package.json', body: JSON.stringify({ name: metadata.name, version }) }]);
  assert.equal(artifactFromTarball(legacy, { origin: 'registry', packageName: metadata.name, version, integrity: integrity(legacy) }).compatibility, null);
});

test('tar parser accepts ordinary npm metadata, prefix paths, PAX paths and GNU long names without extraction', () => {
  const body = JSON.stringify(metadata);
  for (const entries of [[{ name: 'package.json', prefix: 'package', body }],
    [{ name: 'package/', kind: '5' }, { name: 'package/package.json', body }],
    [{ name: 'pax', kind: 'x', body: paxPath('package/package.json') }, { name: 'ignored', body }],
    [{ name: 'long', kind: 'L', body: 'package/package.json\0' }, { name: 'ignored', body }]]) {
    assert.deepEqual(packageMetadataFromTarball(tarball(entries)), metadata);
  }
});

test('tar parser rejects traversal, duplicate files, links, global path replacement and malformed metadata', () => {
  const own = { name: 'package/package.json', body: JSON.stringify(metadata) };
  const cases: Entry[][] = [
    [own, { name: 'package/../outside', body: 'never extracted' }], [own, { name: '/package/outside' }], [own, { name: 'package/a\\b' }],
    [own, own], [own, { name: 'package/link', kind: '2' }], [own, { name: 'package/link', kind: '1' }],
    [{ name: 'pax', kind: 'x', body: paxPath('../outside') }, own],
    [{ name: 'pax', kind: 'g', body: paxPath('package/package.json') }, own],
    [{ name: 'pax', kind: 'x', body: '99 path=package/package.json\n' }, own],
    [own, { name: 'pax', kind: 'x', body: paxPath('package/never-followed') }],
    [{ name: 'package/package.json', body: '[]' }], [{ name: 'package/package.json', body: 'invalid JSON' }],
    [{ name: 'package/package.json', body: ' '.repeat(1024 * 1024 + 1) }], [{ name: 'package/README.md', body: 'missing metadata' }],
  ];
  for (const entries of cases) assert.throws(() => packageMetadataFromTarball(tarball(entries)));
});

test('tar parser rejects checksum corruption, truncated bodies and material after the terminator', () => {
  const record = tarRecord({ name: 'package/package.json', body: JSON.stringify(metadata) });
  const corrupt = Buffer.from(record); corrupt[0] ^= 1;
  assert.throws(() => packageMetadataFromTarball(gzipSync(Buffer.concat([corrupt, Buffer.alloc(1024)]))), /checksum/);
  assert.throws(() => packageMetadataFromTarball(tarball([{ name: 'package/package.json', body: '{}', size: 4096 }])), /truncated/);
  assert.throws(() => packageMetadataFromTarball(gzipSync(Buffer.concat([record, Buffer.alloc(1024), Buffer.from('unexpected')]))), /trailing/);
});

test('tar parser rejects a partial trailing header instead of silently accepting an incomplete archive', () => {
  const record = tarRecord({ name: 'package/package.json', body: JSON.stringify(metadata) });
  assert.throws(() => packageMetadataFromTarball(gzipSync(Buffer.concat([record, Buffer.from('incomplete header')]))));
});
