import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, execFileSync, fork, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_DSH_APP = '/Applications/DeepSeek Harness.app';

export interface VerifyDesktopPairOptions {
  help: boolean;
  buildrTarball?: string;
  pluginDir?: string;
  buildrVersion?: string;
  buildrIntegrity?: string;
  outputFile?: string;
  summaryFile?: string;
  dshApp: string;
}

export function verifyDesktopPairUsage(): string {
  return [
    'Usage: verify-desktop-pair.ts --buildr-tarball <tgz> --plugin-dir <dir> [--buildr-version <v>] [--buildr-integrity <sha512>] [--output <verification.json>] [--summary <desktop-pair.json>] [--dsh-app <app-path>]',
    '',
    'Runs isolated macOS DSH Desktop acceptance against a published Buildr package tarball and DSH Buildr candidate:',
    '  1. Initializes isolated DSH desktop profiles and installs the plugin via local HTTP npm registry & direct tarball URL',
    '  2. Verifies desktop boundary checks (403 without desktop header, 403 with Origin, 409 when @buildr-ai/buildr is absent)',
    '  3. Installs the Buildr tarball + launcher without reinstalling the plugin and verifies 200 handoff & guest web assets',
    '  4. Writes verification.json bound to both Buildr and plugin candidate digests and cleans up all isolated processes & temp dirs',
  ].join('\n');
}

export function parseVerifyDesktopPairArgs(argv: string[]): VerifyDesktopPairOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true, dshApp: DEFAULT_DSH_APP };
  }
  const opts: VerifyDesktopPairOptions = { help: false, dshApp: DEFAULT_DSH_APP };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`Invalid argument: ${flag ?? '<missing>'}`);
    }
    if (flag === '--buildr-tarball') opts.buildrTarball = path.resolve(value);
    else if (flag === '--plugin-dir') opts.pluginDir = path.resolve(value);
    else if (flag === '--buildr-version') opts.buildrVersion = value;
    else if (flag === '--buildr-integrity') opts.buildrIntegrity = value;
    else if (flag === '--output') opts.outputFile = path.resolve(value);
    else if (flag === '--summary') opts.summaryFile = path.resolve(value);
    else if (flag === '--dsh-app') opts.dshApp = path.resolve(value);
    else throw new Error(`Unknown option: ${flag}`);
    index += 1;
  }
  if (!opts.buildrTarball || !opts.pluginDir) {
    throw new Error('--buildr-tarball and --plugin-dir are required (see --help).');
  }
  opts.outputFile ??= path.join(opts.pluginDir, 'verification.json');
  return opts;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function sha512Integrity(buf: Buffer): string {
  return `sha512-${createHash('sha512').update(buf).digest('base64')}`;
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server.close(() => (port > 0 ? resolve(port) : reject(new Error('Failed to allocate free loopback port'))));
    });
  });
}

function cleanEnv(home: string, dshHome: string, envDir: string, dataRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('BUILDR_DEVELOPMENT_DSH_') || key.startsWith('BUILDR_HARNESS_DSH_')
        || key === 'NODE_OPTIONS' || key === 'NODE_PATH' || key === 'ELECTRON_RUN_AS_NODE' || key === 'BUILDR_LAUNCHER_IDENTITY') {
      delete env[key];
    }
  }
  const npmrc = path.join(home, 'empty.npmrc');
  if (!fs.existsSync(npmrc)) fs.writeFileSync(npmrc, '');
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    DSH_HOME: dshHome,
    PATH: [path.dirname(process.execPath), env.PATH].filter(Boolean).join(path.delimiter),
    BUILDR_APP_DATA_DIR: dataRoot,
    BUILDR_PRODUCT_DATA_DIR: dataRoot,
    BUILDR_LOCAL_APP_NO_OPEN: '1',
    BUILDR_LAUNCHER_NO_OPEN: '1',
    BUILDR_LAUNCHER_NO_NOTIFY: '1',
    NPM_CONFIG_USERCONFIG: npmrc,
    npm_config_userconfig: npmrc,
    npm_config_cache: path.join(envDir, 'npm-cache'),
    NPM_CONFIG_CACHE: path.join(envDir, 'npm-cache'),
    npm_config_update_notifier: 'false',
  };
}

function verifyInstalledPluginMatchesTarball(installedDir: string, pluginTarball: string): void {
  for (const rel of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'lib/launcher.js', 'locale/en.json', 'locale/zh.json', 'icon.svg']) {
    const expected = execFileSync('tar', ['-xOzf', pluginTarball, `package/${rel}`]);
    const actual = fs.readFileSync(path.join(installedDir, rel));
    assert.equal(sha256(actual), sha256(expected), `installed file mismatch: ${rel}`);
  }
}

async function initIsolatedDesktopProfile(dshBin: string, dshHome: string, userDataDir: string, env: NodeJS.ProcessEnv): Promise<void> {
  fs.mkdirSync(userDataDir, { recursive: true });
  const profileDir = path.join(dshHome, 'profiles', 'desktop');
  const pkgJson = path.join(profileDir, 'package.json');
  const marker = path.join(profileDir, 'pnpm-workspace.yaml');
  const patch = path.join(profileDir, 'cordis.patch.yml');
  const app = spawn(dshBin, [`--user-data-dir=${userDataDir}`], {
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: false,
  });
  let appStderr = '';
  app.stderr?.on('data', (chunk: Buffer) => { appStderr = (appStderr + chunk.toString()).slice(-4096); });
  try {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (app.exitCode !== null) throw new Error(`Desktop exited during profile init (${app.exitCode}): ${appStderr}`);
      if (fs.existsSync(pkgJson) && fs.existsSync(marker) && fs.existsSync(patch) && !fs.existsSync(path.join(profileDir, 'lock'))) {
        await new Promise(resolve => setTimeout(resolve, 800));
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(fs.existsSync(pkgJson) && fs.existsSync(marker) && fs.existsSync(patch),
      `Isolated desktop profile did not initialize in ${profileDir}; stderr=${appStderr}`);
  } finally {
    if (app.exitCode === null) {
      await new Promise<void>(resolve => {
        const killTimer = setTimeout(() => { try { app.kill('SIGKILL'); } catch { /* ignore */ } resolve(); }, 10_000);
        app.once('exit', () => { clearTimeout(killTimer); resolve(); });
        app.kill('SIGTERM');
      });
    }
  }
}

async function stopIsolatedBuildrWeb(dataRoot: string): Promise<void> {
  const instanceFile = path.join(dataRoot, 'instance.json');
  if (!fs.existsSync(instanceFile)) return;
  let pid: number | undefined;
  try {
    const instance = JSON.parse(fs.readFileSync(instanceFile, 'utf8')) as { url?: unknown; secret?: unknown; pid?: unknown };
    if (typeof instance.pid === 'number' && instance.pid > 1) pid = instance.pid;
    if (typeof instance.url === 'string' && typeof instance.secret === 'string') {
      await fetch(`${instance.url}/api/v1/app/quit-instance`, {
        method: 'POST',
        headers: { 'x-buildr-instance': instance.secret },
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  } catch { /* fallback to PID check below */ }
  if (!pid) return;
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { return; }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  try { process.kill(pid, 'SIGTERM'); } catch { return; }
  await new Promise(resolve => setTimeout(resolve, 800));
  try { process.kill(pid, 'SIGKILL'); } catch { /* exited */ }
}

export async function verifyDesktopPair(opts: VerifyDesktopPairOptions): Promise<{ proof: Record<string, unknown>; pairSummary: Record<string, unknown> }> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(`DSH Desktop pair verification currently supports darwin/arm64, received ${process.platform}/${process.arch}.`);
  }
  assert.equal(process.version, 'v24.15.0', `Run with exact minimum Node v24.15.0, received ${process.version}.`);
  assert.ok(opts.buildrTarball && opts.pluginDir, 'buildrTarball and pluginDir are required');
  assert.ok(fs.existsSync(opts.buildrTarball), `Buildr tarball not found at ${opts.buildrTarball}`);
  assert.ok(fs.existsSync(opts.dshApp), `DSH Desktop application not found at ${opts.dshApp}`);

  const buildrBytes = fs.readFileSync(opts.buildrTarball);
  const buildrIntegrity = sha512Integrity(buildrBytes);
  const buildrMeta = JSON.parse(execFileSync('tar', ['-xOzf', opts.buildrTarball, 'package/package.json'], { encoding: 'utf8' })) as { name?: string; version?: string };
  assert.equal(buildrMeta.name, '@buildr-ai/buildr', `Unexpected Buildr package name: ${buildrMeta.name}`);
  const buildrVersion = buildrMeta.version ?? '';
  assert.ok(buildrVersion.length > 0, 'Missing @buildr-ai/buildr version in tarball');
  if (opts.buildrVersion) assert.equal(buildrVersion, opts.buildrVersion, 'Buildr tarball version mismatch');
  if (opts.buildrIntegrity) assert.equal(buildrIntegrity, opts.buildrIntegrity, 'Buildr tarball integrity mismatch');

  const pluginCandidate = JSON.parse(fs.readFileSync(path.join(opts.pluginDir, 'candidate.json'), 'utf8'));
  const pluginTarball = path.join(opts.pluginDir, pluginCandidate.file);
  const pluginBytes = fs.readFileSync(pluginTarball);
  const pluginShasum = createHash('sha1').update(pluginBytes).digest('hex');

  const dshBin = path.join(opts.dshApp, 'Contents/MacOS/DeepSeek Harness');
  const dshCli = path.join(opts.dshApp, 'Contents/Resources/runtime/cli/bin/dsh');
  const dshRuntimeDir = path.join(opts.dshApp, 'Contents/Resources/app.asar/dsh');
  const dshHostEntry = path.join(dshRuntimeDir, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js');
  const dshPrimaryRuntime = path.join(opts.dshApp, 'Contents/Resources/runtime/primary-runtime');
  const dshPnpm = path.join(dshPrimaryRuntime, 'dependencies/pnpm/bin/pnpm.mjs');
  const dshRuntimeBin = path.join(opts.dshApp, 'Contents/Resources/runtime/bin');
  const dshVersion = execFileSync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(opts.dshApp, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  const npmCli = path.join(path.dirname(path.dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  assert.ok(fs.existsSync(npmCli), `Expected npm-cli.js alongside Node 24.15.0 at ${npmCli}`);

  const tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-dev-pair-verify-')));
  const server = http.createServer((req, res) => {
    const reqUrl = (req.url ?? '/').split('?')[0]!;
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const origin = `http://127.0.0.1:${port}`;
    if (reqUrl === `/${pluginCandidate.file}`) {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': pluginBytes.length });
      res.end(pluginBytes);
      return;
    }
    if (reqUrl === '/@buildr-ai%2Fdsh-buildr' || reqUrl === '/@buildr-ai/dsh-buildr') {
      const pkgMeta = JSON.parse(execFileSync('tar', ['-xOzf', pluginTarball, 'package/package.json'], { encoding: 'utf8' }));
      const body = JSON.stringify({
        name: pluginCandidate.packageName,
        'dist-tags': { next: pluginCandidate.version },
        versions: {
          [pluginCandidate.version]: {
            ...pkgMeta,
            dist: {
              shasum: pluginShasum,
              integrity: pluginCandidate.integrity,
              tarball: `${origin}/${pluginCandidate.file}`,
            },
          },
        },
      });
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let hostChild: ChildProcess | undefined;
  let buildrDataRoot1 = '';

  try {
    // Environment 1: Isolated npm registry install + real DSH desktop-host acceptance
    const env1Dir = path.join(tmpRoot, 'env1');
    const home1 = path.join(env1Dir, 'home');
    const dshHome1 = path.join(env1Dir, 'dsh-home');
    const userData1 = path.join(env1Dir, 'user-data');
    const prefix1 = path.join(env1Dir, 'buildr-prefix');
    fs.mkdirSync(home1, { recursive: true });
    fs.mkdirSync(dshHome1, { recursive: true });
    fs.mkdirSync(prefix1, { recursive: true });
    const dataRoot1 = path.join(fs.realpathSync(home1), 'Library', 'Application Support', 'Buildr');
    fs.mkdirSync(dataRoot1, { recursive: true });
    buildrDataRoot1 = dataRoot1;
    const env1 = cleanEnv(fs.realpathSync(home1), dshHome1, env1Dir, dataRoot1);

    await initIsolatedDesktopProfile(dshBin, dshHome1, userData1, env1);
    await execFileAsync(dshCli, ['plugin', '--profile', 'desktop', 'add', `${pluginCandidate.packageName}@${pluginCandidate.version}`, '--registry', baseUrl], {
      cwd: env1Dir, env: env1, timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
    });
    const desktopProfile1 = path.join(dshHome1, 'profiles', 'desktop');
    verifyInstalledPluginMatchesTarball(path.join(desktopProfile1, 'node_modules', '@buildr-ai', 'dsh-buildr'), pluginTarball);

    const child = fork(dshHostEntry, [dshRuntimeDir, desktopProfile1, dshPrimaryRuntime, dshPnpm, dshRuntimeBin], {
      cwd: desktopProfile1,
      execPath: dshBin,
      execArgv: ['--expose-internals'],
      env: { ...env1, ELECTRON_RUN_AS_NODE: '1', DSH_DESKTOP_NODE_EXECUTABLE: dshBin },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    hostChild = child;

    let stderrBuf = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });
    const ready = await new Promise<{ url: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`DSH desktop-host ready timeout. stderr=${stderrBuf.slice(-2000)}`)), 60_000);
      child.on('message', (msg: any) => {
        if (msg?.type === 'ready') { clearTimeout(timer); resolve(msg); }
        else if (msg?.type === 'fatal') { clearTimeout(timer); reject(new Error(`DSH desktop-host fatal: ${msg.message}\n${msg.diagnostic ?? ''}`)); }
      });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`DSH desktop-host exited prematurely (${code}). stderr=${stderrBuf.slice(-2000)}`)); });
    });

    const dshOrigin = new URL(ready.url).origin;
    const authRes = await fetch(ready.url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    const cookieHeader = authRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    assert.ok(cookieHeader.length > 0, `Expected session cookie from ${ready.url}, status=${authRes.status}`);

    const rejectNoHeader = await fetch(`${dshOrigin}/dsh-buildr/open`, {
      method: 'POST', headers: { cookie: cookieHeader }, signal: AbortSignal.timeout(5000),
    });
    assert.equal(rejectNoHeader.status, 403);
    assert.equal(((await rejectNoHeader.json()) as { code: string }).code, 'desktop-required');

    const rejectWithOrigin = await fetch(`${dshOrigin}/dsh-buildr/open`, {
      method: 'POST', headers: { cookie: cookieHeader, 'x-buildr-development-desktop': '1', origin: dshOrigin }, signal: AbortSignal.timeout(5000),
    });
    assert.equal(rejectWithOrigin.status, 403);

    const missingPeerRes = await fetch(`${dshOrigin}/dsh-buildr/open`, {
      method: 'POST', headers: { cookie: cookieHeader, 'x-buildr-development-desktop': '1' }, signal: AbortSignal.timeout(10_000),
    });
    assert.equal(missingPeerRes.status, 409);
    assert.equal(((await missingPeerRes.json()) as { code: string }).code, 'development-not-installed');

    // Install published @buildr-ai/buildr tarball without reinstalling the plugin
    await execFileAsync(process.execPath, [npmCli, 'install', '--offline', '--global', '--prefix', prefix1, opts.buildrTarball], {
      cwd: env1Dir, env: env1, timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
    });
    const buildrPkgRoot = path.join(prefix1, 'lib', 'node_modules', '@buildr-ai', 'buildr');
    const buildrEntry = path.join(buildrPkgRoot, 'bin', 'buildr.mjs');
    const webPort = await reserveLoopbackPort();
    const launcherTarget = path.join(fs.realpathSync(home1), 'Applications', 'Buildr Development.app');
    const launcherOut = await execFileAsync(process.execPath, [buildrEntry, 'web', 'launcher', 'install', '--target', launcherTarget, '--port', String(webPort), '--json'], {
      cwd: env1Dir, env: env1, encoding: 'utf8', timeout: 60_000,
    });
    assert.equal(JSON.parse(launcherOut.stdout).status, 'ready');

    const openRes = await fetch(`${dshOrigin}/dsh-buildr/open`, {
      method: 'POST', headers: { cookie: cookieHeader, 'x-buildr-development-desktop': '1' }, signal: AbortSignal.timeout(45_000),
    });
    assert.equal(openRes.status, 200);
    const handoff = (await openRes.json()) as { origin: string; endpointId: string; url: string };
    assert.equal(handoff.origin, `http://127.0.0.1:${webPort}`);

    const guestPage = await fetch(handoff.url, { signal: AbortSignal.timeout(10_000) });
    assert.equal(guestPage.status, 200);
    const html = await guestPage.text();
    const assetPath = html.match(/<script[^>]+src="(\/assets\/[^"?]+\.js)"/u)?.[1];
    assert.ok(assetPath, 'Expected bundled Buildr Web JS asset in guest HTML');
    const assetRes = await fetch(`${handoff.origin}${assetPath}`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(assetRes.status, 200);
    const assetJs = await assetRes.text();
    assert.ok(assetJs.includes('buildr-development-desktop/v1:'), 'Expected buildr-development desktop channel bridge in built Web asset');

    await stopIsolatedBuildrWeb(dataRoot1);
    buildrDataRoot1 = '';

    await new Promise<void>(resolve => {
      const t = setTimeout(() => { child.kill('SIGTERM'); resolve(); }, 10_000);
      child.once('exit', () => { clearTimeout(t); resolve(); });
      child.send({ type: 'shutdown' });
    });
    hostChild = undefined;

    // Environment 2: Isolated HTTP .tgz direct link install
    const env2Dir = path.join(tmpRoot, 'env2');
    const home2 = path.join(env2Dir, 'home');
    const dshHome2 = path.join(env2Dir, 'dsh-home');
    const userData2 = path.join(env2Dir, 'user-data');
    fs.mkdirSync(home2, { recursive: true });
    fs.mkdirSync(dshHome2, { recursive: true });
    const dataRoot2 = path.join(fs.realpathSync(home2), 'Library', 'Application Support', 'Buildr');
    const env2 = cleanEnv(fs.realpathSync(home2), dshHome2, env2Dir, dataRoot2);

    await initIsolatedDesktopProfile(dshBin, dshHome2, userData2, env2);
    await execFileAsync(dshCli, ['plugin', '--profile', 'desktop', 'add', `${baseUrl}/${pluginCandidate.file}`], {
      cwd: env2Dir, env: env2, timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
    });
    verifyInstalledPluginMatchesTarball(path.join(dshHome2, 'profiles', 'desktop', 'node_modules', '@buildr-ai', 'dsh-buildr'), pluginTarball);

    const proof = {
      dshVersion,
      buildrVersion,
      buildrIntegrity,
      sha256: pluginCandidate.sha256,
      status: 'passed',
      check: 'installed-dsh-npm-and-github',
      installEvidence: 'isolated-npm-and-http-tarball',
      platform: process.platform,
      arch: process.arch,
      missingPeerPrompt: true,
      authenticatedGuest: true,
      reinstalledPlugin: false,
      verifiedAt: new Date().toISOString(),
    };
    const pairSummary = {
      missingPeerPrompt: true,
      authenticatedGuest: true,
      reinstalledPlugin: false,
      dshVersion,
      buildrVersion,
      buildrIntegrity,
      sha256: pluginCandidate.sha256,
      npmTarballVerified: true,
      httpTarballVerified: true,
      desktopBoundaryRejectedWithoutHeader: true,
    };
    fs.mkdirSync(path.dirname(opts.outputFile!), { recursive: true });
    fs.writeFileSync(opts.outputFile!, JSON.stringify(proof, null, 2) + '\n');
    if (opts.summaryFile) {
      fs.mkdirSync(path.dirname(opts.summaryFile), { recursive: true });
      fs.writeFileSync(opts.summaryFile, JSON.stringify(pairSummary, null, 2) + '\n');
    }
    return { proof, pairSummary };
  } finally {
    if (hostChild && !hostChild.killed) {
      try { hostChild.kill('SIGKILL'); } catch { /* ignore */ }
    }
    if (buildrDataRoot1) {
      await stopIsolatedBuildrWeb(buildrDataRoot1).catch(() => {});
    }
    server.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const parsed = parseVerifyDesktopPairArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(verifyDesktopPairUsage());
  } else {
    const { proof } = await verifyDesktopPair(parsed);
    console.log(JSON.stringify(proof, null, 2));
  }
}
