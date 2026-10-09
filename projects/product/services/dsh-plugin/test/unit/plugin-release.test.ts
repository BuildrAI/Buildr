import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { gzipSync } from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { createReleaseCandidate, PLUGIN_PACKAGE, parseReleaseCandidate, readReleaseCandidate, sourceSdkIdentityFromFiles, type SourceSdkIdentity } from '../../tools/release-candidate.ts';
import { assertReleaseSourceStable, captureReleaseSource, releaseRegistryVersionArguments } from '../../tools/release.ts';
import { assertPluginHostedIdentity, assertPluginOidcClaims, isolatedPluginNpmEnvironment, PLUGIN_PUBLISH_AUTHORITY, probePluginPublishAuthority, publishPluginCandidate, type PublishDependencies } from '../../tools/trusted-publish.ts';

const version = '0.1.0-rc.1', sourceCommit = 'a'.repeat(40), sourceTree = 'b'.repeat(40), workflowSha256 = 'c'.repeat(64), now = Date.parse('2026-10-09T12:00:00Z');
const sourceSdk: SourceSdkIdentity = { baseline: { tag: 'dsh-v0.2.0-rc.2', commit: '639ed015397290b3745d163aafe02ffee4aa3f84', version: '0.2.0-rc.2' }, manifestSha256: 'd'.repeat(64), patchSha256: 'e'.repeat(64), contracts: { slots: ['conversation.trajectory.column', 'conversation.trajectory.inspector.objects'], rawEventRefs: true } };
function temporary(t: TestContext): string { const root = realpathSync(mkdtempSync(join(tmpdir(), 'buildr-dsh-release-test-'))); t.after(() => rmSync(root, { recursive: true, force: true })); return root; }
function archive(metadata: Record<string, unknown>, extra: Array<{ path: string; body: string; kind?: string }> = []): Buffer {
  const entries = [{ path: 'package/package.json', body: JSON.stringify(metadata) }, { path: 'package/lib/index.js', body: 'export const plugin = true;\n' }, ...extra];
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body), header = Buffer.alloc(512);
    header.write(entry.path, 0, 100); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124); header.write('00000000000\0', 136);
    header.fill(32, 148, 156); header[156] = (entry.kind ?? '0').charCodeAt(0); header.write('ustar\0', 257); header.write('00', 263);
    const checksum = header.reduce((total, byte) => total + byte, 0); header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
function metadata(overrides: Record<string, unknown> = {}) {
  return { name: PLUGIN_PACKAGE, version, private: false, repository: { type: 'git', url: 'git+https://github.com/BuildrAI/Buildr.git' }, buildrDshSourceSdk: { upstream: sourceSdk.baseline, sourceManifestSha256: sourceSdk.manifestSha256, sourcePatchSha256: sourceSdk.patchSha256, compiledContracts: sourceSdk.contracts }, ...overrides };
}
function fixture(t: TestContext, overrides: Record<string, unknown> = {}, extra: Array<{ path: string; body: string; kind?: string }> = []) {
  const root = temporary(t), bytes = archive(metadata(overrides), extra), filename = 'buildr-ai-buildr-dsh-plugin-0.1.0-rc.1.tgz';
  const validBytes = archive(metadata());
  const valid = createReleaseCandidate({ version, sourceCommit, sourceTree, filename, bytes: validBytes, sourceSdk, fileCount: 2 });
  const manifest = parseReleaseCandidate({ ...valid, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, fileCount: 2 + extra.length });
  const manifestPath = join(root, 'candidate.json'), tarball = join(root, filename);
  writeFileSync(manifestPath, JSON.stringify(manifest)); writeFileSync(tarball, bytes);
  return { root, bytes, manifest, manifestPath, tarball };
}
function hostedEnvironment(): NodeJS.ProcessEnv {
  return { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'BuildrAI/Buildr', GITHUB_WORKFLOW_REF: 'BuildrAI/Buildr/.github/workflows/publish-dsh-plugin.yml@refs/heads/main', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: sourceCommit, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://run-actions.actions.githubusercontent.com/id-token', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-secret' };
}
function claims(overrides: Record<string, unknown> = {}) {
  return { iss: 'https://token.actions.githubusercontent.com', aud: 'npm:registry.npmjs.org', sub: 'repo:BuildrAI/Buildr:environment:npm-production', repository: 'BuildrAI/Buildr', workflow_ref: 'BuildrAI/Buildr/.github/workflows/publish-dsh-plugin.yml@refs/heads/main', ref: 'refs/heads/main', sha: sourceCommit, runner_environment: 'github-hosted', event_name: 'workflow_dispatch', nbf: now / 1000 - 60, iat: now / 1000 - 60, exp: now / 1000 + 3600, ...overrides };
}
const jwt = (value: Record<string, unknown>) => `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(value)).toString('base64url')}.signature`;
function dependencies(overrides: Partial<PublishDependencies> = {}): PublishDependencies {
  return { env: hostedEnvironment(), now: () => now, source: () => ({ sourceCommit, sourceTree, version, workflowSha256, sourceSdk }), authority: async () => ({ status: 'ready', expected: PLUGIN_PUBLISH_AUTHORITY, workflowSha256, npm: { package: PLUGIN_PACKAGE, tokenType: 'oidc', created: new Date(now - 1000).toISOString(), expires: new Date(now + 3600_000).toISOString() } }), registryWait: { attempts: 2, delayMs: 0 }, ...overrides };
}
test('release preparation probes the exact prerelease version instead of the latest tag', () => {
  assert.deepEqual(releaseRegistryVersionArguments(version), ['view', `${PLUGIN_PACKAGE}@${version}`, 'version', '--json', '--registry=https://registry.npmjs.org/']);
  assert.throws(() => releaseRegistryVersionArguments('next'), /Invalid/);
});
test('release source snapshot rejects dirty source and committed changes during preparation', t => {
  const repo = temporary(t), service = join(repo, 'projects/product/services/dsh-plugin'); mkdirSync(service, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q'); git('config', 'user.name', 'Release test'); git('config', 'user.email', 'release@example.invalid');
  writeFileSync(join(service, 'source.txt'), 'original'); git('add', '.'); git('commit', '-qm', 'original');
  const original = captureReleaseSource(repo); assertReleaseSourceStable(original, captureReleaseSource(repo));
  writeFileSync(join(service, 'source.txt'), 'drift'); assert.throws(() => captureReleaseSource(repo), /Commit plugin source/);
  git('add', '.'); git('commit', '-qm', 'changed'); assert.throws(() => assertReleaseSourceStable(original, captureReleaseSource(repo)), /source changed/);
});
test('fixed source SDK metadata binds reviewed manifest and patch bytes without an SDK', () => {
  const manifest = readFileSync(new URL('../../sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.json', import.meta.url));
  const patch = readFileSync(new URL('../../sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch', import.meta.url));
  const expected = sourceSdkIdentityFromFiles(manifest, patch);
  assert.equal(expected.manifestSha256, createHash('sha256').update(manifest).digest('hex'));
  assert.equal(expected.patchSha256, createHash('sha256').update(patch).digest('hex'));
  assert.deepEqual(expected.baseline, sourceSdk.baseline);
  assert.throws(() => sourceSdkIdentityFromFiles(manifest, Buffer.concat([patch, Buffer.from('drift')])), /patch identity/);
});
test('portable candidate consumes the identical archive after the original directory is gone', t => {
  const original = fixture(t), moved = temporary(t);
  copyFileSync(original.manifestPath, join(moved, 'candidate.json')); copyFileSync(original.tarball, join(moved, original.manifest.filename)); rmSync(original.root, { recursive: true });
  const result = readReleaseCandidate(join(moved, 'candidate.json'), { version, sourceCommit, sourceTree });
  assert.equal(result.tarball, join(moved, original.manifest.filename));
  assert.equal(result.manifest.integrity, `sha512-${createHash('sha512').update(original.bytes).digest('base64')}`);
  assert.equal(JSON.stringify(result.manifest).includes(original.root), false);
});
test('candidate compatibility mirror cannot be stripped or invented independently of archive metadata', t => {
  const compatibility={schemaVersion:'buildr.package-compatibility/v1',provides:[],requires:[]};
  const item=fixture(t),bytes=archive(metadata({buildrCompatibility:compatibility}));
  const declared=createReleaseCandidate({version,sourceCommit,sourceTree,filename:item.manifest.filename,bytes,sourceSdk,fileCount:2});
  writeFileSync(item.tarball,bytes);writeFileSync(item.manifestPath,JSON.stringify(declared));
  assert.deepEqual(readReleaseCandidate(item.manifestPath).manifest.compatibility,compatibility);
  const stripped={...declared};delete stripped.compatibility;writeFileSync(item.manifestPath,JSON.stringify(stripped));
  assert.throws(()=>readReleaseCandidate(item.manifestPath),/archive compatibility mismatch/);
  const legacy=fixture(t);writeFileSync(legacy.manifestPath,JSON.stringify({...legacy.manifest,compatibility}));
  assert.throws(()=>readReleaseCandidate(legacy.manifestPath),/archive compatibility mismatch/);
});
test('a real offline npm pack archive satisfies the portable reader without SDK dependencies', t => {
  const root = temporary(t), pkg = join(root, 'package');
  mkdirSync(join(pkg, 'lib'), { recursive: true }); writeFileSync(join(pkg, 'package.json'), JSON.stringify(metadata())); writeFileSync(join(pkg, 'lib/index.js'), 'export const plugin = true;');
  writeFileSync(join(root, 'user.npmrc'), ''); writeFileSync(join(root, 'global.npmrc'), '');
  const result = spawnSync('npm', ['pack', pkg, '--json', '--pack-destination', root, '--ignore-scripts', '--offline', '--cache', join(root, 'cache')], { cwd: root, env: isolatedPluginNpmEnvironment(process.env, root), encoding: 'utf8' });
  assert.equal(result.status, 0, 'offline npm pack must complete without registry or account access');
  const [pack] = JSON.parse(result.stdout), bytes = readFileSync(join(root, pack.filename));
  const manifest = createReleaseCandidate({ version, sourceCommit, sourceTree, filename: pack.filename, bytes, sourceSdk, fileCount: pack.files.length });
  const manifestPath = join(root, 'candidate.json'); writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.equal(readReleaseCandidate(manifestPath).manifest.integrity, pack.integrity);
});
test('candidate refuses name, version, source, registry, paths, byte drift and symlinks', t => {
  const item = fixture(t);
  for (const changed of [{ packageName: '@buildr-ai/buildr' }, { packageName: '@buildr-ai/buildr-dsh-plugin-dev' }, { registry: 'https://example.invalid/' }, { filename: '../candidate.tgz' }, { filename: 'C:\\candidate.tgz' }, { sdk: '/original/sdk' }, { tarball: '/original/package.tgz' }, { integrity: 'sha512-bad' }]) assert.throws(() => parseReleaseCandidate({ ...item.manifest, ...changed }), /candidate_invalid/);
  for (const expected of [{ version: '0.2.0' }, { sourceCommit: 'f'.repeat(40) }, { sourceTree: 'f'.repeat(40) }]) assert.throws(() => readReleaseCandidate(item.manifestPath, expected), /drift/);
  writeFileSync(item.tarball, Buffer.concat([item.bytes, Buffer.from('changed')])); assert.throws(() => readReleaseCandidate(item.manifestPath), /byte identity/);
  rmSync(item.tarball); const external = join(temporary(t), 'external.tgz'); writeFileSync(external, item.bytes); symlinkSync(external, item.tarball); assert.throws(() => readReleaseCandidate(item.manifestPath), /regular file/);
});
test('archive identity and forbidden contents are checked without executing package code', t => {
  for (const changed of [{ name: '@buildr-ai/buildr' }, { version: '0.2.0' }, { repository: { url: 'https://github.com/other/project' } }, { scripts: { postinstall: 'exit 99' } }, { buildrDshSourceSdk: {} }]) {
    const item = fixture(t, changed); assert.throws(() => readReleaseCandidate(item.manifestPath), /mismatch|scripts/);
  }
  for (const extra of [{ path: 'package/lib/source.ts', body: 'export {}' }, { path: 'package/.npmrc', body: 'should-never-be-used' }, { path: 'package/../escape', body: 'unsafe' }, { path: 'package/link', body: '', kind: '2' }]) {
    const item = fixture(t, {}, [extra]); assert.throws(() => readReleaseCandidate(item.manifestPath), /development|unsafe|links/);
  }
});
test('hosted identity is bound to the main plugin workflow and forbids local or other package workflows', () => {
  assertPluginHostedIdentity(hostedEnvironment(), sourceCommit);
  for (const changed of [{ RUNNER_ENVIRONMENT: 'self-hosted' }, { GITHUB_ACTIONS: 'false' }, { GITHUB_REF: 'refs/heads/dev' }, { GITHUB_WORKFLOW_REF: 'BuildrAI/Buildr/.github/workflows/publish.yml@refs/heads/main' }, { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_SHA: 'f'.repeat(40) }]) assert.throws(() => assertPluginHostedIdentity({ ...hostedEnvironment(), ...changed }, sourceCommit));
});
test('OIDC claims reject wrong environment, workflow, source and expired identity', () => {
  assertPluginOidcClaims(jwt(claims()), sourceCommit, now);
  for (const changed of [{ sub: 'repo:BuildrAI/Buildr:environment:other' }, { workflow_ref: 'BuildrAI/Buildr/.github/workflows/publish.yml@refs/heads/main' }, { sha: 'f'.repeat(40) }, { runner_environment: 'self-hosted' }, { exp: now / 1000 }, { aud: 'other' }, { nbf: now / 1000 + 120 }]) assert.throws(() => assertPluginOidcClaims(jwt(claims(changed)), sourceCommit, now));
});
test('the real OIDC exchange protocol uses the plugin endpoint and never retains either token', async () => {
  const token = jwt(claims()), calls: string[] = [];
  const result = await probePluginPublishAuthority({ sourceCommit, sourceTree, version, workflowSha256, sourceSdk }, { env: hostedEnvironment(), now: () => now,
    fetchImpl: async (url, options) => { calls.push(String(url)); if (calls.length === 1) return new Response(JSON.stringify({ value: token })); assert.equal(options?.headers && (options.headers as Record<string, string>).Authorization, `Bearer ${token}`); return new Response(JSON.stringify({ token: 'exchange-secret', token_type: 'oidc', created: (now - 1000) / 1000, expires: (now + 3600_000) / 1000 }), { status: 201 }); } });
  assert.match(calls[0]!, /audience=npm%3Aregistry.npmjs.org/); assert.match(calls[1]!, /exchange\/package\/%40buildr-ai%2Fbuildr-dsh-plugin$/);
  for (const secret of [token, 'request-secret', 'exchange-secret']) assert.equal(JSON.stringify(result).includes(secret), false);
});
test('missing identity, failed exchange and expired exchange cannot authorize publication', async () => {
  const state = { sourceCommit, sourceTree, version, workflowSha256, sourceSdk };
  await assert.rejects(probePluginPublishAuthority(state, { env: hostedEnvironment(), now: () => now, fetchImpl: async () => new Response('secret-body', { status: 403 }) }), /request-failed/);
  await assert.rejects(probePluginPublishAuthority(state, { env: { ...hostedEnvironment(), ACTIONS_ID_TOKEN_REQUEST_TOKEN: undefined }, fetchImpl: async () => { throw new Error('must not fetch'); } }), /request-missing/);
  let reads = 0;
  await assert.rejects(probePluginPublishAuthority(state, { env: hostedEnvironment(), now: () => now, fetchImpl: async () => ++reads === 1 ? new Response(JSON.stringify({ value: jwt(claims()) })) : new Response(JSON.stringify({ token: 'secret', token_type: 'oidc', created: now / 1000 - 60, expires: now / 1000 }), { status: 201 }) }), /exchange-expired/);
});
test('npm environment keeps Actions identity but discards all npm authentication and config overrides', () => {
  const isolated = isolatedPluginNpmEnvironment({ ...hostedEnvironment(), NPM_TOKEN: 'never-forward', NODE_AUTH_TOKEN: 'never-forward', npm_config__authToken: 'never-forward', NPM_CONFIG_USERCONFIG: '/original/config', NPM_CONFIG_REGISTRY: 'https://private.invalid/', PATH: '/runtime/bin' }, '/isolated');
  assert.equal(isolated.NPM_TOKEN, undefined); assert.equal(isolated.NODE_AUTH_TOKEN, undefined); assert.equal(isolated.npm_config__authToken, undefined);
  assert.equal(isolated.NPM_CONFIG_USERCONFIG, '/isolated/user.npmrc'); assert.equal(isolated.NPM_CONFIG_GLOBALCONFIG, '/isolated/global.npmrc'); assert.equal(isolated.NPM_CONFIG_REGISTRY, undefined);
  assert.equal(isolated.ACTIONS_ID_TOKEN_REQUEST_TOKEN, 'request-secret'); assert.equal(isolated.PATH, '/runtime/bin');
});
test('published identical bytes are reused; conflict or unknown queries never send a publication', async t => {
  for (const state of ['same', 'conflict', 'unknown'] as const) {
    const item = fixture(t); let writes = 0;
    const result = await publishPluginCandidate({ manifestPath: item.manifestPath, version, sourceCommit }, dependencies({ registry: async () => { if (state === 'unknown') throw new Error('credential-like message must not escape'); return { published: true, integrity: state === 'same' ? item.manifest.integrity : 'other' }; }, publish: async () => { writes++; return { status: 0 }; } }));
    assert.equal(writes, 0); assert.equal(result.status, state === 'same' ? 'passed' : 'blocked'); assert.equal(result.action, state === 'same' ? 'reused' : 'blocked');
    assert.equal(JSON.stringify(result).includes('credential-like'), false);
  }
});
test('a lost publication response is recovered from identical public bytes without resending', async t => {
  const item = fixture(t); let writes = 0, reads = 0;
  const result = await publishPluginCandidate({ manifestPath: item.manifestPath, version, sourceCommit }, dependencies({ registry: async () => ++reads === 1 ? { published: false } : { published: true, integrity: item.manifest.integrity }, publish: async tarball => { writes++; assert.equal(tarball, item.tarball); assert.deepEqual(readFileSync(tarball), item.bytes); throw new Error('response-lost'); } }));
  assert.equal(result.status, 'passed'); assert.equal(result.attempted, true); assert.equal(writes, 1);
  const again = await publishPluginCandidate({ manifestPath: item.manifestPath, version, sourceCommit }, dependencies({ registry: async () => ({ published: true, integrity: item.manifest.integrity }), publish: async () => { writes++; return { status: 0 }; } }));
  assert.equal(again.action, 'reused'); assert.equal(writes, 1);
});
test('public success recovery does not require a fresh write authority', async t => {
  const item = fixture(t); let writes = 0, authorityCalls = 0;
  const deps = dependencies({ registry: async () => ({ published: false }), publish: async () => { writes++; throw new Error('lost'); } });
  const initial = await publishPluginCandidate({ manifestPath: item.manifestPath, version, sourceCommit }, deps);
  assert.equal(initial.action, 'readback-required'); assert.equal(writes, 1);
  const again = await publishPluginCandidate({ manifestPath: item.manifestPath, version, sourceCommit }, dependencies({ authority: async () => { authorityCalls++; throw new Error('write authority unavailable'); }, registry: async () => ({ published: true, integrity: item.manifest.integrity }), publish: async () => { writes++; return { status: 0 }; } }));
  assert.equal(again.status, 'passed'); assert.equal(again.action, 'reused'); assert.equal(again.attempted, true); assert.equal(writes, 1); assert.equal(authorityCalls, 0);
});
test('even matching candidate and archive cannot forge the committed source SDK identity', async t => {
  const item = fixture(t); let writes = 0, queries = 0;
  const forgedSdk = { ...sourceSdk, manifestSha256: 'f'.repeat(64) };
  const bytes = archive(metadata({ buildrDshSourceSdk: { upstream: forgedSdk.baseline, sourceManifestSha256: forgedSdk.manifestSha256, sourcePatchSha256: forgedSdk.patchSha256, compiledContracts: forgedSdk.contracts } }));
  const forged = createReleaseCandidate({ version, sourceCommit, sourceTree, filename: item.manifest.filename, bytes, sourceSdk: forgedSdk, fileCount: 2 });
  writeFileSync(item.tarball, bytes); writeFileSync(item.manifestPath, JSON.stringify(forged));
  await assert.rejects(publishPluginCandidate({ manifestPath: item.manifestPath, version, sourceCommit }, dependencies({ registry: async () => { queries++; return { published: false }; }, publish: async () => { writes++; return { status: 0 }; } })), /fixed source SDK drift/);
  assert.equal(writes, 0); assert.equal(queries, 0);
});
test('an attempted but absent or unknown version is never published again, including after journal transport', async t => {
  const item = fixture(t); let writes = 0;
  const deps = dependencies({ registry: async () => ({ published: false }), publish: async () => { writes++; return { status: 1 }; } });
  const first = await publishPluginCandidate({ manifestPath: item.manifestPath, version, sourceCommit }, deps);
  assert.equal(first.status, 'blocked'); assert.equal(first.action, 'readback-required'); assert.equal(first.attempted, true); assert.equal(writes, 1);
  const moved = temporary(t); for (const filename of ['candidate.json', item.manifest.filename, 'publication.json']) copyFileSync(join(item.root, filename), join(moved, filename));
  const second = await publishPluginCandidate({ manifestPath: join(moved, 'candidate.json'), version, sourceCommit }, deps);
  assert.equal(second.status, 'blocked'); assert.equal(writes, 1);
  const third = await publishPluginCandidate({ manifestPath: join(moved, 'candidate.json'), version, sourceCommit }, { ...deps, registry: async () => { throw new Error('query unknown'); } });
  assert.equal(third.registry, 'unknown'); assert.equal(writes, 1);
});
test('source or archive drift during authorization is rejected before the write', async t => {
  for (const drift of ['source', 'archive', 'candidate-and-archive'] as const) {
    const item = fixture(t); let writes = 0, authorized = false;
    const deps = dependencies({ source: () => ({ sourceCommit, sourceTree: authorized && drift === 'source' ? 'f'.repeat(40) : sourceTree, version, workflowSha256, sourceSdk }), registry: async () => ({ published: false }),
      authority: async source => {
        authorized = true; if (drift === 'archive') writeFileSync(item.tarball, 'changed');
        if (drift === 'candidate-and-archive') {
          const bytes = archive(metadata({ description: 'Different valid bytes for the same source and version' }));
          const replacement = createReleaseCandidate({ version, sourceCommit, sourceTree, filename: item.manifest.filename, bytes, sourceSdk, fileCount: 2 });
          writeFileSync(item.tarball, bytes); writeFileSync(item.manifestPath, JSON.stringify(replacement));
        }
        return dependencies().authority!(source);
      }, publish: async () => { writes++; return { status: 0 }; } });
    const result = await publishPluginCandidate({ manifestPath: item.manifestPath, version, sourceCommit }, deps);
    assert.equal(result.status, 'blocked'); assert.equal(result.attempted, false); assert.equal(writes, 0);
  }
});
test('confirmed public bytes remain known through multiple absent and unknown recovery reads', async t => {
  const item = fixture(t); let writes = 0, authorizations = 0;
  const deps = dependencies({ authority: async () => { authorizations++; throw new Error('new auth unavailable'); }, publish: async () => { writes++; return { status: 0 }; } });
  const first = await publishPluginCandidate({ manifestPath: item.manifestPath, version, sourceCommit }, { ...deps, registry: async () => ({ published: true, integrity: item.manifest.integrity }) });
  assert.equal(first.publishedObserved, true); assert.equal(first.attempted, false);
  for (const state of ['absent', 'absent', 'unknown', 'absent']) {
    const result = await publishPluginCandidate({ manifestPath: item.manifestPath, version, sourceCommit }, { ...deps, registry: async () => { if (state === 'unknown') throw new Error('read unavailable'); return { published: false }; } });
    assert.equal(result.publishedObserved, true); assert.equal(result.status, 'blocked');
  }
  assert.equal(writes, 0); assert.equal(authorizations, 0);
});
test('wrong candidate or malformed recovery journal fails before publication', async t => {
  const item = fixture(t); let writes = 0;
  const deps = dependencies({ registry: async () => ({ published: false }), publish: async () => { writes++; return { status: 0 }; } });
  await assert.rejects(publishPluginCandidate({ manifestPath: item.manifestPath, version: '0.2.0', sourceCommit }, deps), /source-drift/);
  writeFileSync(join(item.root, 'publication.json'), JSON.stringify({ schemaVersion: 'wrong', attempted: false }));
  await assert.rejects(publishPluginCandidate({ manifestPath: item.manifestPath, version, sourceCommit }, deps), /journal-invalid/);
  assert.equal(writes, 0);
});
