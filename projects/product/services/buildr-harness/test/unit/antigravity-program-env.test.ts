import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { gzipSync } from 'node:zlib';
import { antigravityProgramPolicy, ensureAntigravityAutoUpdateDisabled } from '../../src/executors/antigravity/program.ts';
import { executableIdentity, isolatedEnvironment } from '../../src/executors/native-process.ts';
import { NativeProgramManager } from '../../src/executors/program-manager.ts';
import { isCompatibleProgram, nativeProgramPolicies, resolveManifestPlatform } from '../../src/executors/program-policy.ts';

function makeTempDir(t: TestContext): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agy-prog-env-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeOctal(target: Buffer, offset: number, length: number, value: number): void {
  const str = value.toString(8).padStart(length - 1, '0');
  target.write(str, offset, length - 1, 'ascii');
  target[offset + length - 1] = 0;
}

function buildSingleMemberTarGz(name: string, content: Buffer): Buffer {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, Math.min(Buffer.byteLength(name), 100), 'utf8');
  writeOctal(header, 100, 8, 0o755);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, content.length);
  writeOctal(header, 136, 12, 1_700_000_000);
  header[156] = '0'.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i]!;
  header.write(sum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  const pad = (512 - (content.length % 512)) % 512;
  const chunks = [header, content];
  if (pad > 0) chunks.push(Buffer.alloc(pad, 0));
  chunks.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(chunks));
}

test('Task 2.1: Antigravity manifest program policy, autoUpdate:false private settings, managedOnly admission, and post-run identity stability', async t => {
  assert.equal(nativeProgramPolicies.antigravity, antigravityProgramPolicy);
  assert.equal(antigravityProgramPolicy.major, 1);
  assert.equal(antigravityProgramPolicy.compatibility, '1.x.x');
  assert.equal(antigravityProgramPolicy.managedOnly, true);
  assert.equal(antigravityProgramPolicy.versionDisplay, 'program');
  assert.equal(isCompatibleProgram('antigravity', '1.5.8'), true);
  assert.equal(isCompatibleProgram('antigravity', '1.99.0-rc.1'), true);
  assert.equal(isCompatibleProgram('antigravity', '0.9.0'), false);
  assert.equal(isCompatibleProgram('antigravity', '2.0.0'), false);

  const dist = antigravityProgramPolicy.distribution;
  assert.equal(dist.kind, 'manifest');
  assert.deepEqual(dist.manifestAllowedHosts, ['antigravity-cli-auto-updater-974169037036.us-central1.run.app']);
  assert.deepEqual(dist.archiveAllowedHosts, ['storage.googleapis.com']);
  assert.equal(dist.payload['tar.gz']?.member, 'antigravity');
  assert.equal(dist.payload.binary, true);

  for (const [platform, arch, expected] of [
    ['darwin', 'arm64', 'darwin_arm64'],
    ['darwin', 'x64', 'darwin_amd64'],
    ['linux', 'x64', 'linux_amd64'],
    ['linux', 'arm64', 'linux_arm64'],
    ['win32', 'x64', 'windows_amd64'],
  ] as const) {
    const mapped = resolveManifestPlatform(platform, arch);
    assert.equal(mapped, expected);
    assert.equal(
      dist.manifest(mapped!).href,
      `https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/${expected}.json`,
    );
  }

  const dir = makeTempDir(t);
  const root = path.join(dir, 'agent-service');
  const signal = AbortSignal.timeout(10_000);
  const fixtureSource = fs.readFileSync(
    path.resolve(import.meta.dirname, '../integration/executors/fixtures/antigravity-acp.mjs'),
  );
  const cliPayload = Buffer.concat([
    Buffer.from(`#!${process.execPath}\n`, 'utf8'),
    fixtureSource.subarray(fixtureSource.indexOf(0x0a) + 1),
  ]);
  const archive = buildSingleMemberTarGz('antigravity', cliPayload);
  const archiveSha512 = createHash('sha512').update(archive).digest('hex');

  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'antigravity-cli-auto-updater-974169037036.us-central1.run.app') {
      return new Response(
        JSON.stringify({
          version: '1.5.8',
          url: 'https://storage.googleapis.com/antigravity-cli-releases/1.5.8/antigravity-darwin-arm64.tar.gz',
          sha512: archiveSha512,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.hostname === 'storage.googleapis.com') {
      return new Response(new Uint8Array(archive), { status: 200 });
    }
    throw new Error(`unexpected host ${url.hostname}`);
  };

  const manager = new NativeProgramManager(root, { PATH: process.env.PATH ?? '' }, undefined, {
    fetchImpl,
    platform: 'darwin',
    arch: 'arm64',
  });

  // Managed install writes package, prepared.json, AND private settings.json { autoUpdate: false }
  const installedExe = await manager.install({
    provider: 'antigravity',
    attemptId: 'agy-install-01',
    signal,
    progress: () => {},
  });
  assert.ok(fs.existsSync(installedExe));
  assert.equal(manager.isManaged('antigravity', installedExe), true);

  const settingsPath = path.join(root, 'connections', 'antigravity', 'home', '.gemini', 'antigravity-cli', 'settings.json');
  assert.ok(fs.existsSync(settingsPath));
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(settings.autoUpdate, false);

  // Preserves existing unrelated keys in settings.json while enforcing autoUpdate: false
  fs.writeFileSync(settingsPath, JSON.stringify({ theme: 'dark', autoUpdate: true }, null, 2));
  await ensureAntigravityAutoUpdateDisabled(path.join(root, 'connections', 'antigravity'));
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, 'utf8')), { theme: 'dark', autoUpdate: false });

  // Discover finds managed candidate as compatible
  const discovered = await manager.discover({ provider: 'antigravity', signal });
  assert.equal(discovered.candidates.length, 1);
  assert.equal(discovered.candidates[0]?.version, '1.5.8');
  assert.equal(discovered.candidates[0]?.compatible, true);

  // External unmanaged boundExecutable is rejected (`managedOnly: true`)
  const externalExe = path.join(dir, 'external-agy');
  fs.writeFileSync(externalExe, cliPayload, { mode: 0o755 });
  const externalBound = await manager.discover({ provider: 'antigravity', boundExecutable: externalExe, signal });
  assert.equal(externalBound.candidates[0]?.compatible, false);
  assert.match(externalBound.candidates[0]?.diagnostic ?? '', /独立受管程序/);
  await assert.rejects(
    manager.discover({ provider: 'antigravity', executable: externalExe, signal }),
    (err: any) => err?.code === 'agent_program_not_managed',
  );

  // Identity of managed binary remains unchanged before & after running
  const identityBefore = await executableIdentity(installedExe);
  const rediscovered = await manager.discover({ provider: 'antigravity', boundExecutable: installedExe, signal });
  assert.equal(rediscovered.candidates[0]?.compatible, true);
  const identityAfter = await executableIdentity(installedExe);
  assert.equal(identityAfter, identityBefore);
});

test('Task 2.2: isolatedEnvironment preserves Linux host-keyring session variables only when credentialScope === "host-keyring" without leaking provider secrets', () => {
  const inputEnv: NodeJS.ProcessEnv = {
    PATH: '/usr/local/bin:/usr/bin',
    LANG: 'zh_CN.UTF-8',
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
    XDG_RUNTIME_DIR: '/run/user/1000',
    OPENAI_API_KEY: 'sk-secret-openai',
    ANTHROPIC_API_KEY: 'sk-ant-secret',
    GEMINI_API_KEY: 'AIza-secret-gemini',
    GOOGLE_API_KEY: 'AIza-secret-google',
    HOME: '/Users/real-host',
    XDG_CONFIG_HOME: '/Users/real-host/.config',
  };

  // 1. Linux + host-keyring retains DBUS_SESSION_BUS_ADDRESS and XDG_RUNTIME_DIR, keeps private HOME, drops secrets
  const linuxKeyring = isolatedEnvironment(
    inputEnv,
    '/private/agy/home',
    '/private/agy/tmp',
    {},
    undefined,
    { credentialScope: 'host-keyring', platform: 'linux' },
  );
  assert.equal(linuxKeyring.HOME, '/private/agy/home');
  assert.equal(linuxKeyring.USERPROFILE, '/private/agy/home');
  assert.equal(linuxKeyring.TMPDIR, '/private/agy/tmp');
  assert.equal(linuxKeyring.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/run/user/1000/bus');
  assert.equal(linuxKeyring.XDG_RUNTIME_DIR, '/run/user/1000');
  assert.equal(linuxKeyring.OPENAI_API_KEY, undefined);
  assert.equal(linuxKeyring.ANTHROPIC_API_KEY, undefined);
  assert.equal(linuxKeyring.GEMINI_API_KEY, undefined);
  assert.equal(linuxKeyring.GOOGLE_API_KEY, undefined);
  assert.equal(linuxKeyring.XDG_CONFIG_HOME, undefined);

  // Empty Linux keyring vars are not copied
  const linuxEmpty = isolatedEnvironment(
    { ...inputEnv, DBUS_SESSION_BUS_ADDRESS: '', XDG_RUNTIME_DIR: '' },
    '/private/agy/home',
    '/private/agy/tmp',
    {},
    undefined,
    { credentialScope: 'host-keyring', platform: 'linux' },
  );
  assert.equal(linuxEmpty.DBUS_SESSION_BUS_ADDRESS, undefined);
  assert.equal(linuxEmpty.XDG_RUNTIME_DIR, undefined);

  // 2. macOS and Windows + host-keyring do NOT copy Linux DBus/XDG vars
  for (const platform of ['darwin', 'win32'] as const) {
    const nonLinux = isolatedEnvironment(
      inputEnv,
      '/private/agy/home',
      '/private/agy/tmp',
      {},
      undefined,
      { credentialScope: 'host-keyring', platform },
    );
    assert.equal(nonLinux.HOME, '/private/agy/home');
    assert.equal(nonLinux.DBUS_SESSION_BUS_ADDRESS, undefined);
    assert.equal(nonLinux.XDG_RUNTIME_DIR, undefined);
    assert.equal(nonLinux.GEMINI_API_KEY, undefined);
  }

  // 3. Existing executors (default / 'isolated-dir') never retain DBUS_SESSION_BUS_ADDRESS or XDG_RUNTIME_DIR even on Linux
  for (const options of [undefined, { platform: 'linux' as const }, { credentialScope: 'isolated-dir' as const, platform: 'linux' as const }]) {
    const isolated = isolatedEnvironment(inputEnv, '/private/other/home', '/private/other/tmp', {}, undefined, options);
    assert.equal(isolated.HOME, '/private/other/home');
    assert.equal(isolated.DBUS_SESSION_BUS_ADDRESS, undefined);
    assert.equal(isolated.XDG_RUNTIME_DIR, undefined);
    assert.equal(isolated.OPENAI_API_KEY, undefined);
  }
});
