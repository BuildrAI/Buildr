import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { crc32, deflateRawSync, gzipSync } from 'node:zlib';
import { createAgentService } from '../../src/index.ts';
import { createModelAccess } from '../../src/model-access/application.ts';
import { createGoogleAiProxyProvider } from '../../src/model-access/providers/google-ai-proxy.ts';
import {
  GOOGLE_AI_ANTIGRAVITY_CATALOG,
  buildGoogleAiRouteTable,
  googleAiModelAlias,
  resolveGoogleAiUpstreamModel,
} from '../../src/model-access/providers/google-ai-proxy-catalog.ts';
import {
  CLIPROXY_ALLOWED_HOSTS,
  CLIPROXY_RELEASES,
  CLIPROXY_RELEASE_BASE_URL,
  ensureCliProxyInstalled,
} from '../../src/model-access/providers/google-ai-proxy-install.ts';

function makeTempDir(t: TestContext): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'google-ai-proxy-unit-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

interface TarEntrySpec {
  name: string;
  typeflag?: string;
  linkname?: string;
  content?: Buffer;
}

function writeOctal(target: Buffer, offset: number, length: number, value: number): void {
  const str = value.toString(8).padStart(length - 1, '0');
  target.write(str, offset, length - 1, 'ascii');
  target[offset + length - 1] = 0;
}

function buildTarGz(entries: TarEntrySpec[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    header.write(entry.name, 0, Math.min(Buffer.byteLength(entry.name), 100), 'utf8');
    writeOctal(header, 100, 8, 0o755);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    const content = entry.content ?? Buffer.alloc(0);
    writeOctal(header, 124, 12, content.length);
    writeOctal(header, 136, 12, 1_700_000_000);
    header[156] = (entry.typeflag ?? '0').charCodeAt(0);
    if (entry.linkname) {
      header.write(entry.linkname, 157, Math.min(Buffer.byteLength(entry.linkname), 100), 'utf8');
    }
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    header.fill(0x20, 148, 156);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i]!;
    header.write(sum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
    header[154] = 0;
    header[155] = 0x20;
    chunks.push(header);
    if (content.length > 0) {
      chunks.push(content);
      const pad = (512 - (content.length % 512)) % 512;
      if (pad > 0) chunks.push(Buffer.alloc(pad, 0));
    }
  }
  chunks.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(chunks));
}

interface ZipEntrySpec {
  name: string;
  content: Buffer;
  method?: 0 | 8;
  crcOverride?: number;
  symlink?: boolean;
}

function buildZip(entries: ZipEntrySpec[]): Buffer {
  const localParts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const method = entry.method ?? 8;
    const compressed = method === 0 ? entry.content : deflateRawSync(entry.content);
    const crc = (entry.crcOverride ?? crc32(entry.content)) >>> 0;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressed.length, 18);
    lfh.writeUInt32LE(entry.content.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    localParts.push(lfh, nameBuf, compressed);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE((3 << 8) | 20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compressed.length, 20);
    cdh.writeUInt32LE(entry.content.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    const mode = entry.symlink ? 0o120777 : 0o100755;
    cdh.writeUInt32LE((mode << 16) >>> 0, 38);
    cdh.writeUInt32LE(offset, 42);
    cdParts.push(cdh, nameBuf);

    offset += lfh.length + nameBuf.length + compressed.length;
  }

  const cd = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, cd, eocd]);
}

test('CLIProxyAPI v8.0.69 release table covers all 6 platforms with valid SHA-256 digests', () => {
  for (const key of ['darwin:arm64', 'darwin:x64', 'linux:arm64', 'linux:x64', 'win32:arm64', 'win32:x64']) {
    const asset = CLIPROXY_RELEASES[key];
    assert.ok(asset, `missing release asset for ${key}`);
    assert.match(asset.sha256, /^[0-9a-f]{64}$/);
    assert.ok(asset.filename.startsWith('CLIProxyAPI_8.0.69_'));
  }
});

test('google-ai-subscription is non-linked and fresh AgentService does not auto-create or poll it', async t => {
  const root = makeTempDir(t);
  const provider = createGoogleAiProxyProvider(path.join(root, 'CLIProxyAPI'));
  assert.equal(provider.linked, undefined);
  assert.equal(provider.autoInspect, undefined);
  assert.equal(provider.singleton, true);
  assert.equal(typeof provider.prepare, 'function');

  const service = createAgentService({
    dataRoot: root,
    executors: [],
    resolveWorkspace: () => ({ rootPath: root }),
    assertTask() {},
  });
  try {
    const accounts = await service.models.accounts.list();
    assert.equal(accounts.accounts.some(a => a.provider === 'google-ai-subscription'), false);
    const listedProvider = accounts.providers.find(p => p.id === 'google-ai-subscription');
    assert.ok(listedProvider);
    assert.equal(listedProvider.linked, undefined);
    assert.equal(listedProvider.singleton, true);
    assert.equal(listedProvider.authentication?.type, 'oauth');

    const catalog = await service.models.catalog.list({ refresh: true });
    assert.equal(catalog.diagnostic, undefined);
    assert.equal(fs.existsSync(path.join(root, 'CLIProxyAPI')), false);
  } finally {
    await service.close();
  }
});

test('adding google-ai-subscription downloads tar.gz with redirect/SHA-256 verification and generates isolated config.yaml', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const binaryContent = Buffer.from('#!/bin/sh\necho ok\n', 'utf8');
  const archive = buildTarGz([
    { name: 'LICENSE', content: Buffer.from('MIT') },
    { name: './cli-proxy-api', content: binaryContent },
    { name: 'README.md', content: Buffer.from('# readme') },
    { name: 'config.example.yaml', content: Buffer.from('server: {}') },
  ]);
  const assetName = 'CLIProxyAPI_8.0.69_darwin_aarch64.tar.gz';
  const requests: string[] = [];
  const fetchMock: typeof fetch = async input => {
    const url = String(input);
    requests.push(url);
    if (url === CLIPROXY_RELEASE_BASE_URL + assetName) {
      return new Response(null, {
        status: 302,
        headers: { location: `https://release-assets.githubusercontent.com/assets/${assetName}` },
      });
    }
    assert.equal(url, `https://release-assets.githubusercontent.com/assets/${assetName}`);
    return new Response(new Uint8Array(archive), { status: 200 });
  };

  const provider = createGoogleAiProxyProvider(proxyDir, {
    platform: 'darwin',
    arch: 'arm64',
    fetch: fetchMock,
    releases: {
      'darwin:arm64': {
        filename: assetName,
        sha256: sha256Hex(archive),
        archiveKind: 'tar.gz',
        member: 'cli-proxy-api',
      },
    },
  });
  const access = createModelAccess({ root: path.join(root, 'agent-service', 'model-access'), providers: [provider] });
  try {
    const added = await access.accounts.add({ provider: 'google-ai-subscription' });
    assert.equal(added.provider, 'google-ai-subscription');
    assert.equal(added.status, 'not-authenticated');
    assert.equal(requests.length, 2);

    const installedBin = path.join(proxyDir, 'cli-proxy-api');
    assert.deepEqual(fs.readFileSync(installedBin), binaryContent);
    assert.equal(fs.statSync(installedBin).mode & 0o111, 0o111);

    const cfg = JSON.parse(fs.readFileSync(path.join(proxyDir, 'config.yaml'), 'utf8'));
    assert.equal(cfg['config-version'], 8);
    assert.equal(cfg.server.host, '127.0.0.1');
    assert.ok(Number.isInteger(cfg.server.port) && cfg.server.port >= 1024 && cfg.server.port <= 65535);
    assert.match(cfg.access['api-keys'][0], /^[0-9a-f]{64}$/);
    assert.equal(path.resolve(cfg.oauth['auth-dir']), path.join(proxyDir, 'auth'));
    assert.equal(fs.existsSync(path.join(proxyDir, 'auth')), true);

    const mgmtKey = fs.readFileSync(path.join(proxyDir, 'quota-management.key'), 'utf8').trim();
    assert.match(mgmtKey, /^[0-9a-f]{64}$/);
    assert.equal(cfg.management['disable-control-panel'], true);
    assert.equal(cfg.management['secret-key'], mgmtKey);

    // Adding again must be rejected by singleton constraint without downloading.
    await assert.rejects(access.accounts.add({ provider: 'google-ai-subscription' }), { code: 'model_provider_already_configured' });
    assert.equal(requests.length, 2);
  } finally {
    await access.close();
  }
});

test('ensureCliProxyInstalled extracts Windows zip (deflate & store) with CRC-32 verification', async t => {
  for (const method of [8, 0] as const) {
    const root = makeTempDir(t);
    const proxyDir = path.join(root, 'CLIProxyAPI');
    const exeBytes = Buffer.from('MZ-mock-cli-proxy-api-binary', 'utf8');
    const archive = buildZip([
      { name: 'README.md', content: Buffer.from('docs'), method },
      { name: 'cli-proxy-api.exe', content: exeBytes, method },
    ]);
    const assetName = 'CLIProxyAPI_8.0.69_windows_amd64.zip';
    const result = await ensureCliProxyInstalled(proxyDir, {
      platform: 'win32',
      arch: 'x64',
      fetch: async url => {
        assert.equal(String(url), CLIPROXY_RELEASE_BASE_URL + assetName);
        return new Response(new Uint8Array(archive), { status: 200 });
      },
      releases: {
        'win32:x64': {
          filename: assetName,
          sha256: sha256Hex(archive),
          archiveKind: 'zip',
          member: 'cli-proxy-api.exe',
        },
      },
    });
    assert.equal(result.downloaded, true);
    assert.deepEqual(fs.readFileSync(path.join(proxyDir, 'cli-proxy-api.exe')), exeBytes);
    assert.equal(fs.existsSync(path.join(proxyDir, 'config.yaml')), true);
  }
});

test('existing CLIProxyAPI binary, config.yaml, and auth credentials are reused untouched with zero downloads', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const authDir = path.join(proxyDir, 'auth');
  fs.mkdirSync(authDir, { recursive: true });

  const existingBin = Buffer.from('#!/bin/sh\necho custom-dev-bin\n', 'utf8');
  const existingConfig = JSON.stringify({
    'config-version': 8,
    server: { host: '127.0.0.1', port: 53850 },
    access: { 'api-keys': ['existing-dev-key'] },
    oauth: { 'auth-dir': authDir },
  }) + '\n';
  const existingCred = JSON.stringify({ type: 'antigravity', email: 'dev@example.com', refresh_token: 'tok', project_id: 'p1' });

  fs.writeFileSync(path.join(proxyDir, 'cli-proxy-api'), existingBin, { mode: 0o755 });
  fs.writeFileSync(path.join(proxyDir, 'config.yaml'), existingConfig);
  fs.writeFileSync(path.join(authDir, 'antigravity-dev.json'), existingCred);

  let fetchCount = 0;
  const provider = createGoogleAiProxyProvider(proxyDir, {
    fetch: async () => {
      fetchCount++;
      throw new Error('must_not_download_when_existing');
    },
  });
  const access = createModelAccess({ root: path.join(root, 'agent-service', 'model-access'), providers: [provider] });
  try {
    const added = await access.accounts.add({ provider: 'google-ai-subscription' });
    assert.equal(added.provider, 'google-ai-subscription');
    assert.equal(fetchCount, 0);
    assert.deepEqual(fs.readFileSync(path.join(proxyDir, 'cli-proxy-api')), existingBin);
    assert.equal(fs.readFileSync(path.join(proxyDir, 'config.yaml'), 'utf8'), existingConfig);
    assert.equal(fs.readFileSync(path.join(authDir, 'antigravity-dev.json'), 'utf8'), existingCred);
  } finally {
    await access.close();
  }
});

test('security rejections prevent persisting account row or leaving partial artifacts', async t => {
  const cases: Array<{
    label: string;
    platform: NodeJS.Platform;
    arch: string;
    asset: { filename: string; sha256: string; archiveKind: 'tar.gz' | 'zip'; member: string };
    fetch: typeof fetch;
    code: string;
  }> = [];

  const validTar = buildTarGz([{ name: 'cli-proxy-api', content: Buffer.from('ok') }]);
  cases.push({
    label: 'sha256 mismatch',
    platform: 'darwin',
    arch: 'arm64',
    asset: { filename: 'a.tar.gz', sha256: '0'.repeat(64), archiveKind: 'tar.gz', member: 'cli-proxy-api' },
    fetch: async () => new Response(new Uint8Array(validTar), { status: 200 }),
    code: 'model_google_ai_digest_mismatch',
  });

  cases.push({
    label: 'disallowed redirect host',
    platform: 'darwin',
    arch: 'arm64',
    asset: { filename: 'a.tar.gz', sha256: sha256Hex(validTar), archiveKind: 'tar.gz', member: 'cli-proxy-api' },
    fetch: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example.com/a.tar.gz' } }),
    code: 'model_google_ai_download_disallowed',
  });

  cases.push({
    label: 'http downgrade redirect',
    platform: 'darwin',
    arch: 'arm64',
    asset: { filename: 'a.tar.gz', sha256: sha256Hex(validTar), archiveKind: 'tar.gz', member: 'cli-proxy-api' },
    fetch: async () => new Response(null, { status: 302, headers: { location: `http://${CLIPROXY_ALLOWED_HOSTS[0]}/a.tar.gz` } }),
    code: 'model_google_ai_download_disallowed',
  });

  const tarSymlink = buildTarGz([{ name: 'cli-proxy-api', typeflag: '2', linkname: '/bin/sh' }]);
  cases.push({
    label: 'tar symlink member',
    platform: 'darwin',
    arch: 'arm64',
    asset: { filename: 'a.tar.gz', sha256: sha256Hex(tarSymlink), archiveKind: 'tar.gz', member: 'cli-proxy-api' },
    fetch: async () => new Response(new Uint8Array(tarSymlink), { status: 200 }),
    code: 'model_google_ai_archive_invalid',
  });

  const tarTraversal = buildTarGz([{ name: '../cli-proxy-api', content: Buffer.from('bad') }]);
  cases.push({
    label: 'tar path traversal',
    platform: 'darwin',
    arch: 'arm64',
    asset: { filename: 'a.tar.gz', sha256: sha256Hex(tarTraversal), archiveKind: 'tar.gz', member: 'cli-proxy-api' },
    fetch: async () => new Response(new Uint8Array(tarTraversal), { status: 200 }),
    code: 'model_google_ai_archive_invalid',
  });

  const zipBadCrc = buildZip([{ name: 'cli-proxy-api.exe', content: Buffer.from('exe'), crcOverride: 0xdeadbeef }]);
  cases.push({
    label: 'zip CRC mismatch',
    platform: 'win32',
    arch: 'x64',
    asset: { filename: 'a.zip', sha256: sha256Hex(zipBadCrc), archiveKind: 'zip', member: 'cli-proxy-api.exe' },
    fetch: async () => new Response(new Uint8Array(zipBadCrc), { status: 200 }),
    code: 'model_google_ai_archive_invalid',
  });

  const zipSymlink = buildZip([{ name: 'cli-proxy-api.exe', content: Buffer.from('/bin/sh'), symlink: true }]);
  cases.push({
    label: 'zip symlink entry',
    platform: 'win32',
    arch: 'x64',
    asset: { filename: 'a.zip', sha256: sha256Hex(zipSymlink), archiveKind: 'zip', member: 'cli-proxy-api.exe' },
    fetch: async () => new Response(new Uint8Array(zipSymlink), { status: 200 }),
    code: 'model_google_ai_archive_invalid',
  });

  for (const item of cases) {
    const root = makeTempDir(t);
    const proxyDir = path.join(root, 'CLIProxyAPI');
    const provider = createGoogleAiProxyProvider(proxyDir, {
      platform: item.platform,
      arch: item.arch,
      fetch: item.fetch,
      releases: { [`${item.platform}:${item.arch}`]: item.asset },
    });
    const access = createModelAccess({ root: path.join(root, 'agent-service', 'model-access'), providers: [provider] });
    try {
      await assert.rejects(access.accounts.add({ provider: 'google-ai-subscription' }), { code: item.code }, item.label);
      assert.equal(access.accounts.list({ includeDisabled: true }).accounts.length, 0, `${item.label} must not persist account`);
      assert.equal(fs.existsSync(path.join(proxyDir, item.asset.member)), false, `${item.label} must not leave binary`);
      assert.equal(fs.existsSync(path.join(proxyDir, 'config.yaml')), false, `${item.label} must not leave config`);
      const left = fs.existsSync(proxyDir) ? fs.readdirSync(proxyDir) : [];
      assert.equal(left.some(name => name.startsWith('.prepare-')), false, `${item.label} left .prepare-*`);
    } finally {
      await access.close();
    }
  }
});

test('concurrent ensureCliProxyInstalled calls coalesce into a single download', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const archive = buildTarGz([{ name: 'cli-proxy-api', content: Buffer.from('#!/bin/sh\necho hi\n') }]);
  let fetches = 0;
  const release = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const provider = createGoogleAiProxyProvider(proxyDir, {
    platform: 'darwin',
    arch: 'arm64',
    fetch: async () => {
      fetches++;
      started.resolve();
      await release.promise;
      return new Response(new Uint8Array(archive), { status: 200 });
    },
    releases: {
      'darwin:arm64': {
        filename: 'CLIProxyAPI_8.0.69_darwin_aarch64.tar.gz',
        sha256: sha256Hex(archive),
        archiveKind: 'tar.gz',
        member: 'cli-proxy-api',
      },
    },
  });

  const first = provider.prepare!({ configRoot: proxyDir, environment: {} });
  await started.promise;
  const second = provider.prepare!({ configRoot: proxyDir, environment: {} });
  release.resolve();
  await Promise.all([first, second]);
  assert.equal(fetches, 1);
});

test('GOOGLE_AI_ANTIGRAVITY_CATALOG declares unique variant and base entries for all Antigravity models', () => {
  const ids = GOOGLE_AI_ANTIGRAVITY_CATALOG.antigravity.map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'catalog model IDs must be unique');
  for (const expected of [
    'gemini-4-carbon-low', 'gemini-4-carbon-medium', 'gemini-4-carbon-high',
    'gemini-4-argon-low', 'gemini-4-argon-medium', 'gemini-4-argon-high',
    'gemini-4-hydrogen-low', 'gemini-4-hydrogen-medium', 'gemini-4-hydrogen-high', 'gemini-4-hydrogen-xhigh',
    'gemini-3.8-flash-low', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-high', 'gemini-3.8-flash-tiered',
    'claude-opus-5-5-low', 'claude-opus-5-5-medium', 'claude-opus-5-5-high',
    'claude-sonnet-5-5-low', 'claude-sonnet-5-5-medium', 'claude-sonnet-5-5-high',
    'claude-opus-4-6-thinking', 'claude-sonnet-4-6',
    'gemini-3-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite',
    'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-thinking',
    'gpt-oss-120b-medium',
  ]) {
    assert.ok(ids.includes(expected), `missing expected catalog entry ${expected}`);
  }
});

test('buildGoogleAiRouteTable aggregates series variants and maps every (model, effort) to an exact upstream model ID', () => {
  const table = buildGoogleAiRouteTable([
    { id: 'chat_20706' },
    { id: 'tab_flash_lite_preview' },
    { id: 'gemini-3.1-flash-image' },
    { id: 'gemini-4-carbon-high', display_name: 'Gemini 4 Carbon (High)' },
    { id: 'gemini-4-carbon-low', display_name: 'Gemini 4 Carbon (Low)' },
    { id: 'gemini-4-carbon-medium', display_name: 'Gemini 4 Carbon (Medium)' },
    { id: 'gemini-4-hydrogen-xhigh', display_name: 'Gemini 4 Hydrogen (XHigh)' },
    { id: 'gemini-4-hydrogen-low', display_name: 'Gemini 4 Hydrogen (Low)' },
    { id: 'gemini-4-hydrogen-medium', display_name: 'Gemini 4 Hydrogen (Medium)' },
    { id: 'gemini-4-hydrogen-high', display_name: 'Gemini 4 Hydrogen (High)' },
    { id: 'gemini-3.8-flash-low', display_name: 'Gemini 3.8 Flash (Low)' },
    { id: 'gemini-3.8-flash-medium', display_name: 'Gemini 3.8 Flash (Medium)' },
    { id: 'gemini-3.8-flash-high', display_name: 'Gemini 3.8 Flash (High)' },
    { id: 'gemini-3.8-flash-tiered', display_name: 'Gemini 3.8 Flash (Tiered)' },
    { id: 'claude-opus-5-5-low', display_name: 'Claude Opus 5.5 (Low)' },
    { id: 'claude-opus-5-5-medium', display_name: 'Claude Opus 5.5 (Medium)' },
    { id: 'claude-opus-5-5-high', display_name: 'Claude Opus 5.5 (High)' },
    { id: 'gpt-oss-120b-medium', display_name: 'GPT-OSS 120B (Medium)' },
    { id: 'gemini-3-flash', display_name: 'Gemini 3 Flash' },
    { id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro' },
  ]);

  assert.deepEqual(
    table.models.map(m => ({
      id: m.id,
      label: m.label,
      images: m.images,
      efforts: m.reasoningEfforts?.map(e => e.id),
      defaultEffort: m.defaultReasoningEffort,
    })),
    [
      { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', images: true, efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
      { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', images: true, efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', images: true, efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', images: true, efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
      { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B', images: false, efforts: ['medium'], defaultEffort: 'medium' },
      { id: 'gemini-3-flash', label: 'Gemini 3 Flash', images: true, efforts: undefined, defaultEffort: undefined },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', images: true, efforts: undefined, defaultEffort: undefined },
    ],
  );

  // Every series + effort maps 1:1 to a real upstream model ID without any `(depth)` suffix.
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gemini-4-carbon', 'low'), 'gemini-4-carbon-low');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gemini-4-carbon', 'medium'), 'gemini-4-carbon-medium');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gemini-4-carbon', 'high'), 'gemini-4-carbon-high');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gemini-4-carbon', undefined), 'gemini-4-carbon-medium');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gemini-4-hydrogen', 'xhigh'), 'gemini-4-hydrogen-xhigh');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gemini-3.8-flash', 'low'), 'gemini-3.8-flash-low');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'claude-opus-5-5', 'medium'), 'claude-opus-5-5-medium');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gpt-oss-120b-medium', 'medium'), 'gpt-oss-120b-medium');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gpt-oss-120b-medium', undefined), 'gpt-oss-120b-medium');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gemini-3-flash', undefined), 'gemini-3-flash');

  // Legacy persisted model IDs resolve to the exact requested effort's variant.
  assert.equal(googleAiModelAlias('gemini-4-carbon-high'), 'gemini-4-carbon');
  assert.equal(googleAiModelAlias('gemini-3.8-flash-tiered'), 'gemini-3.8-flash');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gemini-4-carbon-high', 'medium'), 'gemini-4-carbon-medium');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gemini-4-carbon-high', undefined), 'gemini-4-carbon-high');
  assert.equal(resolveGoogleAiUpstreamModel(table, 'gemini-3.8-flash-tiered', 'low'), 'gemini-3.8-flash-low');

  // Unsupported efforts and unentitled subsets are rejected instead of fabricated.
  assert.throws(() => resolveGoogleAiUpstreamModel(table, 'gemini-4-carbon', 'xhigh'), { code: 'agent_reasoning_unavailable' });
  assert.throws(() => resolveGoogleAiUpstreamModel(table, 'gemini-3-flash', 'medium'), { code: 'agent_reasoning_unavailable' });
  assert.throws(() => resolveGoogleAiUpstreamModel(table, 'nonexistent-model', undefined), { code: 'model_unavailable' });

  const partial = buildGoogleAiRouteTable([{ id: 'gemini-4-carbon-high' }]);
  assert.deepEqual(partial.models[0]?.reasoningEfforts?.map(e => e.id), ['high']);
  assert.equal(partial.models[0]?.defaultReasoningEffort, 'high');
  assert.throws(() => resolveGoogleAiUpstreamModel(partial, 'gemini-4-carbon', 'medium'), { code: 'agent_reasoning_unavailable' });
});
