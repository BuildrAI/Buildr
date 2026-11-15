import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { gzipSync } from 'node:zlib';
import { createAgentService } from '../../src/index.ts';
import { NativeProgramManager } from '../../src/executors/program-manager.ts';
import { nativeProgramPolicies, type NativeProgramPolicy } from '../../src/executors/program-policy.ts';
import { ManifestReleaseIncompatibleError, readManifestRelease, readProgramLatestRelease } from '../../src/executors/program-release.ts';
import type { AgentCapabilities, AgentExecutor } from '../../src/contracts.ts';

const MANIFEST_HOST = 'updates.example.com';
const MANIFEST_CDN_HOST = 'manifest-cdn.example.com';
const ARCHIVE_HOST = 'downloads.example.com';
const ARCHIVE_CDN_HOST = 'archive-cdn.example.com';

const basePolicy: NativeProgramPolicy = {
  id: 'manifest-fixture',
  major: 1,
  bindingSeries: '1.0',
  compatibility: '1.x.x',
  version: '1.0.0',
  package: 'manifest-fixture',
  entry: 'fixture-cli',
  names: ['fixture-cli'],
  url: 'https://docs.example.com/install',
  label: 'Fixture 独立程序',
  guidance: 'Buildr 会准备独立 Fixture 程序，不执行环境改写。',
  distribution: {
    kind: 'manifest',
    manifest: platform => new URL(`https://${MANIFEST_HOST}/releases/${platform}.json`),
    manifestAllowedHosts: [MANIFEST_HOST, MANIFEST_CDN_HOST],
    archiveAllowedHosts: [ARCHIVE_HOST, ARCHIVE_CDN_HOST],
    digest: 'sha512',
    payload: {
      'tar.gz': { member: 'fixture-cli' },
      binary: true,
    },
    entry: 'fixture-cli',
  },
  versionDisplay: 'program',
};

const testPolicies: Readonly<Record<string, NativeProgramPolicy>> = {
  ...nativeProgramPolicies,
  [basePolicy.id]: basePolicy,
};

function makeTempDir(t: TestContext): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-dist-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function sha512Hex(bytes: Uint8Array): string {
  return createHash('sha512').update(bytes).digest('hex');
}

interface TarEntrySpec {
  name: string;
  prefix?: string;
  typeflag?: string;
  linkname?: string;
  content?: Buffer;
  declaredSize?: number;
  gnu?: boolean;
  corruptChecksum?: boolean;
}

function writeOctal(target: Buffer, offset: number, length: number, value: number): void {
  const str = value.toString(8).padStart(length - 1, '0');
  target.write(str, offset, length - 1, 'ascii');
  target[offset + length - 1] = 0;
}

function buildTarHeader(entry: TarEntrySpec): Buffer {
  const header = Buffer.alloc(512, 0);
  header.write(entry.name, 0, Math.min(Buffer.byteLength(entry.name), 100), 'utf8');
  writeOctal(header, 100, 8, 0o755);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  const size = entry.declaredSize ?? (entry.content?.length ?? 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 1_700_000_000);
  header[156] = (entry.typeflag ?? '0').charCodeAt(0);
  if (entry.linkname) {
    header.write(entry.linkname, 157, Math.min(Buffer.byteLength(entry.linkname), 100), 'utf8');
  }
  if (entry.gnu) {
    header.write('ustar  \0', 257, 8, 'ascii');
  } else {
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    if (entry.prefix) {
      header.write(entry.prefix, 345, Math.min(Buffer.byteLength(entry.prefix), 155), 'utf8');
    }
  }
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i]!;
  if (entry.corruptChecksum) sum += 7;
  const chk = sum.toString(8).padStart(6, '0');
  header.write(chk, 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function buildTarGz(entries: TarEntrySpec[], options: { eofBlocks?: number; trailingByteAfterEof?: number } = {}): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    chunks.push(buildTarHeader(entry));
    const content = entry.content ?? Buffer.alloc(0);
    if (content.length > 0) {
      chunks.push(content);
      const pad = (512 - (content.length % 512)) % 512;
      if (pad > 0) chunks.push(Buffer.alloc(pad, 0));
    }
  }
  const eofBlocks = options.eofBlocks ?? 2;
  for (let i = 0; i < eofBlocks; i++) chunks.push(Buffer.alloc(512, 0));
  if (options.trailingByteAfterEof !== undefined) {
    const trailing = Buffer.alloc(512, 0);
    trailing[0] = options.trailingByteAfterEof;
    chunks.push(trailing);
  }
  return gzipSync(Buffer.concat(chunks));
}

function makeCliScript(reportedVersion: string): Buffer {
  return Buffer.from(`#!/bin/sh\necho "fixture-cli ${reportedVersion}"\n`, 'utf8');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

test('Task 5.2: readManifestRelease validates platform mapping, per-hop HTTPS redirects, 64 KiB cap, SHA-512, strict SemVer, and major admission', async () => {
  const signal = AbortSignal.timeout(5_000);
  const validSha = 'a'.repeat(128);
  const validArchiveUrl = `https://${ARCHIVE_HOST}/v1.2.3/fixture.tar.gz`;

  // 1. All 5 supported platforms map accurately + up to 5 allowed HTTPS redirects succeed
  const platformMatrix: Array<[NodeJS.Platform, string, string]> = [
    ['darwin', 'arm64', 'darwin_arm64'],
    ['darwin', 'x64', 'darwin_amd64'],
    ['linux', 'x64', 'linux_amd64'],
    ['linux', 'arm64', 'linux_arm64'],
    ['win32', 'x64', 'windows_amd64'],
  ];
  for (const [platform, arch, expectedPlatform] of platformMatrix) {
    let hops = 0;
    const fetchFiveHops: typeof fetch = async input => {
      const url = new URL(String(input));
      hops++;
      if (hops <= 5) {
        const nextHost = hops % 2 === 1 ? MANIFEST_CDN_HOST : MANIFEST_HOST;
        return redirectResponse(`https://${nextHost}/hop-${hops}/${expectedPlatform}.json`);
      }
      assert.ok(url.pathname.endsWith(`/${expectedPlatform}.json`));
      return jsonResponse({ version: '1.2.3-rc.1', url: validArchiveUrl, sha512: validSha.toUpperCase() });
    };
    const result = await readManifestRelease('manifest-fixture', signal, {
      policies: testPolicies,
      platform,
      arch,
      fetchImpl: fetchFiveHops,
    });
    assert.equal(hops, 6);
    assert.equal(result.platform, expectedPlatform);
    assert.equal(result.version, '1.2.3-rc.1');
    assert.equal(result.sha512, validSha);
    assert.equal(result.url, validArchiveUrl);
  }

  // 2. Unsupported platforms fail cleanly
  for (const [platform, arch] of [['win32', 'arm64'], ['freebsd', 'x64'], ['darwin', 'ia32']] as const) {
    await assert.rejects(
      readManifestRelease('manifest-fixture', signal, {
        policies: testPolicies,
        platform: platform as NodeJS.Platform,
        arch,
        fetchImpl: async () => assert.fail('must not fetch for unsupported platform'),
      }),
      /agent_release_platform_unsupported/,
    );
  }

  // 3. Non-allowlisted initial host, mid-hop disallowed host, HTTP downgrade, userinfo, and >5 redirects all fail
  const disallowedInitialPolicy: NativeProgramPolicy = {
    ...basePolicy,
    distribution: {
      ...(basePolicy.distribution as Extract<NativeProgramPolicy['distribution'], { kind: 'manifest' }>),
      manifest: () => new URL('https://untrusted.example.com/manifest.json'),
    },
  };
  await assert.rejects(
    readManifestRelease('manifest-fixture', signal, {
      policies: { [basePolicy.id]: disallowedInitialPolicy },
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl: async () => assert.fail('must reject before network'),
    }),
    /agent_release_redirect_disallowed/,
  );

  await assert.rejects(
    readManifestRelease('manifest-fixture', signal, {
      policies: testPolicies,
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl: async input => {
        const url = new URL(String(input));
        if (url.hostname === MANIFEST_HOST) return redirectResponse(`https://${MANIFEST_CDN_HOST}/step1.json`);
        return redirectResponse('https://evil.example.com/step2.json');
      },
    }),
    /agent_release_redirect_disallowed/,
  );

  for (const badRedirect of [
    `http://${MANIFEST_CDN_HOST}/downgrade.json`,
    `https://user:secret@${MANIFEST_CDN_HOST}/creds.json`,
  ]) {
    await assert.rejects(
      readManifestRelease('manifest-fixture', signal, {
        policies: testPolicies,
        platform: 'darwin',
        arch: 'arm64',
        fetchImpl: async () => redirectResponse(badRedirect),
      }),
      /agent_release_redirect_disallowed/,
    );
  }

  await assert.rejects(
    readManifestRelease('manifest-fixture', signal, {
      policies: testPolicies,
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl: async (_input) => redirectResponse(`https://${MANIFEST_CDN_HOST}/loop.json`),
    }),
    /agent_release_redirect_exceeded/,
  );

  // 4. Manifest > 64 KiB rejected
  await assert.rejects(
    readManifestRelease('manifest-fixture', signal, {
      policies: testPolicies,
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl: async () => jsonResponse({ version: '1.2.3', url: validArchiveUrl, sha512: validSha, pad: 'x'.repeat(65 * 1024) }),
    }),
    /agent_release_too_large/,
  );

  // 5. Invalid versions (including path separators, .., +, leading zeros, >64 chars), bad sha512, disallowed archive URL, incompatible major
  for (const badVersion of [
    '../1.2.3',
    '1.2.3/../../evil',
    '1.2.3\\evil',
    '1.2..3',
    '01.2.3',
    '1.2.3-01',
    '1.2.3+build.1',
    `1.2.3-${'a'.repeat(60)}`,
    '',
  ]) {
    await assert.rejects(
      readManifestRelease('manifest-fixture', signal, {
        policies: testPolicies,
        platform: 'darwin',
        arch: 'arm64',
        fetchImpl: async () => jsonResponse({ version: badVersion, url: validArchiveUrl, sha512: validSha }),
      }),
      /agent_release_invalid/,
      `expected rejection for version=${badVersion}`,
    );
  }

  await assert.rejects(
    readManifestRelease('manifest-fixture', signal, {
      policies: testPolicies,
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl: async () => jsonResponse({ version: '1.2.3', url: validArchiveUrl, sha512: 'not-hex' }),
    }),
    /agent_release_invalid/,
  );

  await assert.rejects(
    readManifestRelease('manifest-fixture', signal, {
      policies: testPolicies,
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl: async () => jsonResponse({ version: '1.2.3', url: 'https://evil-cdn.example.com/a.tar.gz', sha512: validSha }),
    }),
    /agent_release_redirect_disallowed/,
  );

  await assert.rejects(
    readProgramLatestRelease('manifest-fixture', signal, {
      policies: testPolicies,
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl: async () => jsonResponse({ version: '2.0.0', url: validArchiveUrl, sha512: validSha }),
    }),
    (err: unknown) => err instanceof ManifestReleaseIncompatibleError && err.version === '2.0.0',
  );

  // 6. Network failure does not downgrade
  await assert.rejects(
    readProgramLatestRelease('manifest-fixture', signal, {
      policies: testPolicies,
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl: async () => { throw new TypeError('fetch failed'); },
    }),
    /agent_release_unavailable/,
  );
});

test('Task 5.3: manifest archive installation succeeds for valid single-member tar.gz & cleans orphan staging, while rejecting all malicious/corrupt payloads without half-finished artifacts', async t => {
  const dir = makeTempDir(t);
  const root = path.join(dir, 'agent-service');
  const signal = AbortSignal.timeout(10_000);

  // Seed an orphan `.prepare-crashed001` directory before manager construction -> cleaned automatically on startup
  const orphanDir = path.join(root, 'programs', 'manifest-fixture', '.prepare-crashed001');
  fs.mkdirSync(orphanDir, { recursive: true });
  fs.writeFileSync(path.join(orphanDir, 'partial.bin'), 'stale');

  let archiveBytes = buildTarGz([{ name: './fixture-cli', content: makeCliScript('1.4.0'), gnu: true }]);
  let manifestVersion = '1.4.0';
  let manifestSha = sha512Hex(archiveBytes);
  let archiveRedirectUrl: string | undefined = `https://${ARCHIVE_CDN_HOST}/objects/fixture-1.4.0.tar.gz`;

  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === MANIFEST_HOST) {
      return jsonResponse({
        version: manifestVersion,
        url: `https://${ARCHIVE_HOST}/download/fixture.tar.gz`,
        sha512: manifestSha,
      });
    }
    if (url.hostname === ARCHIVE_HOST && archiveRedirectUrl) {
      return redirectResponse(archiveRedirectUrl);
    }
    return new Response(new Uint8Array(archiveBytes), { status: 200 });
  };

  const manager = new NativeProgramManager(root, { PATH: process.env.PATH ?? '' }, undefined, {
    policies: testPolicies,
    fetchImpl,
    limits: { maxDownloadBytes: 64 * 1024, maxExtractedBytes: 128 * 1024, maxTarMembers: 16 },
  });
  assert.equal(fs.existsSync(orphanDir), false, 'orphan .prepare-* cleaned on startup');

  // 1. Valid installation uses attempt-named temp dir, verifies SHA-512 & --version, atomically writes package dir & prepared.json
  const exe140 = await manager.install({
    provider: 'manifest-fixture',
    attemptId: 'attempt-alpha-01',
    signal,
    progress: () => {},
  });
  assert.ok(fs.existsSync(exe140));
  const preparedAfter140 = JSON.parse(fs.readFileSync(path.join(root, 'programs', 'manifest-fixture', 'prepared.json'), 'utf8'));
  assert.equal(preparedAfter140.version, '1.4.0');
  assert.equal(path.resolve(preparedAfter140.executable), path.resolve(exe140));

  const discovered = await manager.discover({ provider: 'manifest-fixture', signal });
  assert.equal(discovered.installation.guidance, basePolicy.guidance);
  assert.equal(discovered.candidates[0]?.version, '1.4.0');
  assert.equal(discovered.candidates[0]?.compatible, true);

  // 2. Malicious and abnormal archives for 1.5.0 MUST ALL fail and preserve 1.4.0 + prepared.json with zero leftover `.prepare-*`
  manifestVersion = '1.5.0';
  const badArchives: Array<{ label: string; bytes: Buffer; overrideSha?: string; redirect?: string }> = [
    {
      label: 'symlink member',
      bytes: buildTarGz([{ name: 'fixture-cli', typeflag: '2', linkname: '/bin/sh' }]),
    },
    {
      label: 'hardlink member',
      bytes: buildTarGz([{ name: 'fixture-cli', typeflag: '1', linkname: '/bin/sh' }]),
    },
    {
      label: 'character device member',
      bytes: buildTarGz([{ name: 'fixture-cli', typeflag: '3' }]),
    },
    {
      label: 'PAX extended header',
      bytes: buildTarGz([
        { name: 'PaxHeader/fixture-cli', typeflag: 'x', content: Buffer.from('20 path=../evil\n') },
        { name: 'fixture-cli', content: makeCliScript('1.5.0') },
      ]),
    },
    {
      label: 'dot-dot traversal',
      bytes: buildTarGz([{ name: '../fixture-cli', content: makeCliScript('1.5.0') }]),
    },
    {
      label: 'prefix traversal',
      bytes: buildTarGz([{ prefix: 'sub/../..', name: 'fixture-cli', content: makeCliScript('1.5.0') }]),
    },
    {
      label: 'absolute path',
      bytes: buildTarGz([{ name: '/tmp/fixture-cli', content: makeCliScript('1.5.0') }]),
    },
    {
      label: 'extra undeclared member after valid member',
      bytes: buildTarGz([
        { name: 'fixture-cli', content: makeCliScript('1.5.0') },
        { name: 'install.sh', content: Buffer.from('#!/bin/sh\necho pwn\n') },
      ]),
    },
    {
      label: 'duplicate declared member',
      bytes: buildTarGz([
        { name: 'fixture-cli', content: makeCliScript('1.5.0') },
        { name: 'fixture-cli', content: makeCliScript('1.5.0') },
      ]),
    },
    {
      label: 'missing declared member (empty archive)',
      bytes: buildTarGz([]),
    },
    {
      label: 'missing declared member (wrong filename)',
      bytes: buildTarGz([{ name: 'wrong-binary', content: makeCliScript('1.5.0') }]),
    },
    {
      label: 'truncated tar missing second EOF block',
      bytes: buildTarGz([{ name: 'fixture-cli', content: makeCliScript('1.5.0') }], { eofBlocks: 1 }),
    },
    {
      label: 'truncated gzip stream',
      bytes: buildTarGz([{ name: 'fixture-cli', content: makeCliScript('1.5.0') }]).subarray(0, 40),
    },
    {
      label: 'corrupt tar header checksum',
      bytes: buildTarGz([{ name: 'fixture-cli', content: makeCliScript('1.5.0'), corruptChecksum: true }]),
    },
    {
      label: 'non-zero trailing block after EOF',
      bytes: buildTarGz([{ name: 'fixture-cli', content: makeCliScript('1.5.0') }], { trailingByteAfterEof: 1 }),
    },
    {
      label: 'download exceeds maxDownloadBytes (64 KiB)',
      bytes: Buffer.alloc(70 * 1024, 0x41),
    },
    {
      label: 'extracted size exceeds maxExtractedBytes (128 KiB compressed zeros)',
      bytes: buildTarGz([{ name: 'fixture-cli', content: Buffer.alloc(140 * 1024, 0) }]),
    },
    {
      label: 'SHA-512 digest mismatch',
      bytes: buildTarGz([{ name: 'fixture-cli', content: makeCliScript('1.5.0') }]),
      overrideSha: 'f'.repeat(128),
    },
    {
      label: 'reported --version mismatch (reports 1.4.9 instead of 1.5.0)',
      bytes: buildTarGz([{ name: 'fixture-cli', content: makeCliScript('1.4.9') }]),
    },
    {
      label: 'archive redirect to disallowed host',
      bytes: buildTarGz([{ name: 'fixture-cli', content: makeCliScript('1.5.0') }]),
      redirect: 'https://malicious-mirror.example.com/fixture.tar.gz',
    },
  ];

  for (const item of badArchives) {
    archiveBytes = item.bytes;
    manifestSha = item.overrideSha ?? sha512Hex(item.bytes);
    archiveRedirectUrl = item.redirect ?? `https://${ARCHIVE_CDN_HOST}/objects/fixture-1.5.0.tar.gz`;

    await assert.rejects(
      manager.install({ provider: 'manifest-fixture', attemptId: 'bad-attempt', signal, progress: () => {} }),
      `${item.label} must fail`,
    );

    const entries = fs.readdirSync(path.join(root, 'programs', 'manifest-fixture'));
    assert.equal(entries.some(name => name.startsWith('.prepare-')), false, `${item.label} left .prepare-* behind`);
    assert.equal(entries.some(name => name.startsWith('package-1.5.0-')), false, `${item.label} created half-finished 1.5.0 package`);
    const stillPrepared = JSON.parse(fs.readFileSync(path.join(root, 'programs', 'manifest-fixture', 'prepared.json'), 'utf8'));
    assert.equal(stillPrepared.version, '1.4.0', `${item.label} mutated prepared.json`);
  }

  // 3. Direct binary payload mode on Windows (`platform: 'win32', arch: 'x64'`) also verifies SHA-512, limits, and `--version`
  const winPolicy: NativeProgramPolicy = {
    ...basePolicy,
    entry: 'fixture-cli.js',
    distribution: {
      ...(basePolicy.distribution as Extract<NativeProgramPolicy['distribution'], { kind: 'manifest' }>),
      entry: 'fixture-cli.js',
    },
  };
  const winBinaryBytes = Buffer.from(`console.log('fixture-cli 1.6.0');\n`, 'utf8');
  const winSha = sha512Hex(winBinaryBytes);
  const winManager = new NativeProgramManager(root, { PATH: process.env.PATH ?? '' }, undefined, {
    policies: { [winPolicy.id]: winPolicy },
    platform: 'win32',
    arch: 'x64',
    fetchImpl: async input => {
      const url = new URL(String(input));
      if (url.hostname === MANIFEST_HOST) {
        return jsonResponse({ version: '1.6.0', url: `https://${ARCHIVE_HOST}/win/fixture-cli.exe`, sha512: winSha });
      }
      return new Response(winBinaryBytes, { status: 200 });
    },
  });
  const winExe = await winManager.install({ provider: 'manifest-fixture', attemptId: 'win-attempt', signal, progress: () => {} });
  assert.ok(winExe.includes('package-1.6.0-win32-x64'));
  assert.ok(fs.existsSync(winExe));
});

test('Task 5.4: interruptions (mid-download, mid-extract, pre-switch) and concurrent prepare calls preserve old binary, prepared.json, and connection binding while deduplicating work', async t => {
  const dir = makeTempDir(t);
  const dataRoot = path.join(dir, 'profile');
  const root = path.join(dataRoot, 'agent-service');
  const signal = AbortSignal.timeout(10_000);

  const v1Archive = buildTarGz([{ name: 'fixture-cli', content: makeCliScript('1.1.0') }]);
  const v2Archive = buildTarGz([{ name: 'fixture-cli', content: makeCliScript('1.2.0') }]);

  let currentVersion = '1.1.0';
  let currentArchive = v1Archive;
  let manifestFetches = 0;
  let archiveFetches = 0;
  let streamDelayGate: (() => Promise<void>) | undefined;
  let switchHook: ((ctx: { staging: string }) => Promise<void> | void) | undefined;
  const observedStagingNames: string[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === MANIFEST_HOST) {
      manifestFetches++;
      return jsonResponse({
        version: currentVersion,
        url: `https://${ARCHIVE_HOST}/v/${currentVersion}.tar.gz`,
        sha512: sha512Hex(currentArchive),
      });
    }
    archiveFetches++;
    const payload = currentArchive;
    const half = Math.floor(payload.length / 2);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(payload.subarray(0, half));
        if (streamDelayGate) {
          try {
            await streamDelayGate();
          } catch (err) {
            controller.error(err);
            return;
          }
        }
        if (init?.signal?.aborted) {
          controller.error(init.signal.reason ?? new Error('aborted'));
          return;
        }
        controller.enqueue(payload.subarray(half));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  };

  const manager = new NativeProgramManager(root, { PATH: process.env.PATH ?? '' }, undefined, {
    policies: testPolicies,
    fetchImpl,
    beforeAtomicSwitch: async ctx => {
      observedStagingNames.push(path.basename(ctx.staging));
      await switchHook?.(ctx);
    },
  });

  const caps: AgentCapabilities = {
    text: true,
    images: false,
    approval: true,
    questions: true,
    stop: true,
    resume: true,
    maxInputBytes: 65536,
  };
  const executor: AgentExecutor = {
    descriptor: { id: 'manifest-fixture', label: 'Fixture', capabilities: caps },
    async open(options) {
      return {
        bindingIdentity: `bind:${options.executable}`,
        capabilities: caps,
        async inspectAccount() { return { status: 'ready', label: 'Fixture User' }; },
        async models() { return [{ id: 'm1', label: 'M1', isDefault: true }]; },
        async beginLogin() {},
        async cancelLogin() {},
        async createContext() { return { id: 'ctx-1' }; },
        async resumeContext() {},
        async readHistory() { return []; },
        async observe() { return { status: 'idle', tools: [] }; },
        async send() { throw new Error('unused'); },
        async stop() { return { status: 'stopped', tools: [] }; },
        async reply() {},
        async close() {},
      };
    },
  };

  const service = createAgentService({
    dataRoot,
    executors: [executor],
    programManager: manager,
    resolveWorkspace: () => ({ rootPath: dir }),
    assertTask: () => {},
  });
  t.after(() => service.close());

  // Establish initial 1.1.0 managed installation & connection binding
  const firstPrep = service.connections.prepare('manifest-fixture', {
    expectedRevision: service.connections.read('manifest-fixture').revision,
    install: true,
  });
  let prepView = firstPrep;
  for (let i = 0; i < 400 && prepView.state !== 'ready'; i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
    prepView = service.connections.preparation('manifest-fixture', firstPrep.id);
  }
  assert.equal(prepView.state, 'ready');
  const v1Exe = service.connections.read('manifest-fixture').executable!;
  assert.ok(v1Exe.includes('package-1.1.0-'));
  assert.ok(observedStagingNames[0]?.startsWith(`.prepare-${firstPrep.id.replace(/-/g, '')}`));

  const assertV1Intact = () => {
    assert.ok(fs.existsSync(v1Exe), '1.1.0 binary still exists');
    const prepared = JSON.parse(fs.readFileSync(path.join(root, 'programs', 'manifest-fixture', 'prepared.json'), 'utf8'));
    assert.equal(prepared.version, '1.1.0', 'prepared.json still points to 1.1.0');
    assert.equal(service.connections.read('manifest-fixture').executable, v1Exe, 'connection binding still points to 1.1.0');
    const names = fs.readdirSync(path.join(root, 'programs', 'manifest-fixture'));
    assert.equal(names.some(n => n.startsWith('.prepare-')), false, 'no orphan .prepare-* remains');
    assert.equal(names.some(n => n.startsWith('package-1.2.0-')), false, 'no partial 1.2.0 directory');
  };

  // Advance upstream manifest to 1.2.0
  currentVersion = '1.2.0';
  currentArchive = v2Archive;

  // 1. Interruption mid-download
  {
    const abortDownload = new AbortController();
    streamDelayGate = async () => {
      abortDownload.abort();
      await new Promise(resolve => setTimeout(resolve, 10));
    };
    await assert.rejects(
      manager.install({ provider: 'manifest-fixture', attemptId: 'abort-dl', signal: abortDownload.signal, progress: () => {} }),
      { name: 'AbortError' },
    );
    streamDelayGate = undefined;
    assertV1Intact();
  }

  // 2. Interruption right after download / during extraction phase (progress callback at extraction start)
  {
    const abortExtract = new AbortController();
    await assert.rejects(
      manager.install({
        provider: 'manifest-fixture',
        attemptId: 'abort-extract',
        signal: abortExtract.signal,
        progress: message => {
          if (message.includes('解出')) abortExtract.abort();
        },
      }),
      { name: 'AbortError' },
    );
    assertV1Intact();
  }

  // 3. Interruption right before atomic switch (`beforeAtomicSwitch`)
  {
    const abortPreSwitch = new AbortController();
    switchHook = () => { abortPreSwitch.abort(); };
    await assert.rejects(
      manager.install({ provider: 'manifest-fixture', attemptId: 'abort-switch', signal: abortPreSwitch.signal, progress: () => {} }),
      { name: 'AbortError' },
    );
    switchHook = undefined;
    assertV1Intact();
  }

  // 4. Concurrent prepare deduplication:
  //    - Caller A & Caller B both install 1.2.0 concurrently (only ONE manifest + archive fetch!).
  //    - Caller C requests conflicting explicit version 1.1.9 -> immediately receives `agent_preparation_busy`.
  //    - Caller A aborts mid-flight while Caller B remains active -> Caller A rejects with AbortError, Caller B completes 1.2.0 cleanly!
  manifestFetches = 0;
  archiveFetches = 0;
  let releaseDownload!: () => void;
  let reachedDownload!: () => void;
  const downloadStarted = new Promise<void>(resolve => { reachedDownload = resolve; });
  streamDelayGate = async () => {
    reachedDownload();
    await new Promise<void>(resolve => { releaseDownload = resolve; });
  };

  const callerASignal = new AbortController();
  const callerBProgress: string[] = [];
  const callA = manager.install({ provider: 'manifest-fixture', attemptId: 'concurrent-shared', signal: callerASignal.signal, progress: () => {} });
  await downloadStarted;

  const callB = manager.install({ provider: 'manifest-fixture', attemptId: 'concurrent-b', signal, progress: msg => callerBProgress.push(msg) });
  await assert.rejects(
    manager.install({ provider: 'manifest-fixture', version: '1.1.9', signal, progress: () => {} }),
    (err: any) => err?.code === 'agent_preparation_busy',
  );

  // Abort Caller A while Caller B stays attached -> shared download continues for Caller B!
  callerASignal.abort();
  await assert.rejects(callA, { name: 'AbortError' });

  streamDelayGate = undefined;
  releaseDownload();

  const v2Exe = await callB;
  assert.ok(v2Exe.includes('package-1.2.0-'));
  assert.ok(fs.existsSync(v2Exe));
  assert.equal(manifestFetches, 1, 'concurrent callers coalesced into 1 manifest request');
  assert.equal(archiveFetches, 1, 'concurrent callers coalesced into 1 archive download');
  assert.ok(callerBProgress.length >= 1, 'coalesced caller received progress updates');

  // Existing connection binding on 1.1.0 is STILL untouched until an explicit upgrade commits it!
  assert.equal(service.connections.read('manifest-fixture').executable, v1Exe);
  assert.ok(fs.existsSync(v1Exe));
  const updatedPrepared = JSON.parse(fs.readFileSync(path.join(root, 'programs', 'manifest-fixture', 'prepared.json'), 'utf8'));
  assert.equal(updatedPrepared.version, '1.2.0');
});
