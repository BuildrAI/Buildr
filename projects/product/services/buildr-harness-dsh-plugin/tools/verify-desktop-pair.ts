import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, execFileSync, fork, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_DSH_APP = '/Applications/DeepSeek Harness.app';

export interface VerifyDesktopPairOptions {
  help: boolean;
  harnessDir?: string;
  pluginDir?: string;
  outputFile?: string;
  summaryFile?: string;
  dshApp: string;
}

export function verifyDesktopPairUsage(): string {
  return [
    'Usage: verify-desktop-pair.ts --harness-dir <dir> --plugin-dir <dir> [--output <verification.json>] [--summary <desktop-pair.json>] [--dsh-app <app-path>]',
    '',
    'Runs isolated macOS DSH Desktop acceptance against prepared Harness and DSH Buildr Harness candidates:',
    '  1. Initializes isolated DSH desktop profiles and installs plugin via local HTTP npm registry & direct tarball URL',
    '  2. Verifies desktop boundary checks (403 without desktop header, 403 with Origin, 409 when Harness is absent)',
    '  3. Installs the prepared Harness tarball + launcher without reinstalling the plugin and verifies 200 ticket exchange & guest UI bytes',
    '  4. Writes verification.json bound to both candidate tarballs and cleans up all isolated host processes & temp dirs',
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
    if (flag === '--harness-dir') opts.harnessDir = path.resolve(value);
    else if (flag === '--plugin-dir') opts.pluginDir = path.resolve(value);
    else if (flag === '--output') opts.outputFile = path.resolve(value);
    else if (flag === '--summary') opts.summaryFile = path.resolve(value);
    else if (flag === '--dsh-app') opts.dshApp = path.resolve(value);
    else throw new Error(`Unknown option: ${flag}`);
    index += 1;
  }
  if (!opts.harnessDir || !opts.pluginDir) {
    throw new Error('--harness-dir and --plugin-dir are required (see --help).');
  }
  opts.outputFile ??= path.join(opts.pluginDir, 'verification.json');
  return opts;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function cleanEnv(home: string, dshHome: string, dataRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('BUILDR_HARNESS_DSH_') || key === 'NODE_OPTIONS' || key === 'NODE_PATH' || key === 'ELECTRON_RUN_AS_NODE') {
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
    BUILDR_LAUNCHER_NO_OPEN: '1',
    BUILDR_LAUNCHER_NO_NOTIFY: '1',
    NPM_CONFIG_USERCONFIG: npmrc,
    npm_config_userconfig: npmrc,
  };
}

function verifyInstalledPluginMatchesTarball(installedDir: string, pluginTarball: string): void {
  for (const rel of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'lib/launcher.js']) {
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

export async function verifyDesktopPair(opts: VerifyDesktopPairOptions): Promise<{ proof: Record<string, unknown>; pairSummary: Record<string, unknown> }> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(`DSH Desktop pair verification currently supports darwin/arm64, received ${process.platform}/${process.arch}.`);
  }
  assert.equal(process.version, 'v24.15.0', `Run with exact minimum Node v24.15.0, received ${process.version}.`);
  assert.ok(opts.harnessDir && opts.pluginDir, 'harnessDir and pluginDir are required');
  assert.ok(fs.existsSync(opts.dshApp), `DSH Desktop application not found at ${opts.dshApp}`);

  const harnessCandidate = JSON.parse(fs.readFileSync(path.join(opts.harnessDir, 'candidate.json'), 'utf8'));
  const pluginCandidate = JSON.parse(fs.readFileSync(path.join(opts.pluginDir, 'candidate.json'), 'utf8'));
  const harnessTarball = path.join(opts.harnessDir, harnessCandidate.file);
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

  const tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pair-verify-')));
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
    if (reqUrl === '/@buildr-ai%2Fdsh-buildr-harness' || reqUrl === '/@buildr-ai/dsh-buildr-harness') {
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

  let stopHarness: ((options: { dataRoot: string; profileId: string; mode: string }) => Promise<unknown>) | undefined;
  let hostChild: ChildProcess | undefined;
  let harnessDataRoot1 = '';
  let harnessHome1 = '';
  const prevHome = process.env.HOME;
  const prevAppData = process.env.BUILDR_APP_DATA_DIR;

  try {
    // Environment 1: Isolated npm registry install + real DSH desktop-host acceptance
    const env1Dir = path.join(tmpRoot, 'env1');
    const home1 = path.join(env1Dir, 'home');
    const dshHome1 = path.join(env1Dir, 'dsh-home');
    const userData1 = path.join(env1Dir, 'user-data');
    const dataRoot1 = path.join(env1Dir, 'harness-data');
    const prefix1 = path.join(env1Dir, 'harness-prefix');
    harnessHome1 = home1;
    harnessDataRoot1 = dataRoot1;
    fs.mkdirSync(home1, { recursive: true });
    fs.mkdirSync(dshHome1, { recursive: true });
    fs.mkdirSync(prefix1, { recursive: true });
    const env1 = cleanEnv(home1, dshHome1, dataRoot1);

    await initIsolatedDesktopProfile(dshBin, dshHome1, userData1, env1);
    await execFileAsync(dshCli, ['plugin', '--profile', 'desktop', 'add', `${pluginCandidate.packageName}@${pluginCandidate.version}`, '--registry', baseUrl], {
      cwd: env1Dir, env: env1, timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
    });
    const desktopProfile1 = path.join(dshHome1, 'profiles', 'desktop');
    verifyInstalledPluginMatchesTarball(path.join(desktopProfile1, 'node_modules', '@buildr-ai', 'dsh-buildr-harness'), pluginTarball);

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

    const rejectNoHeader = await fetch(`${dshOrigin}/dsh-buildr-harness/open`, {
      method: 'POST', headers: { cookie: cookieHeader }, signal: AbortSignal.timeout(5000),
    });
    assert.equal(rejectNoHeader.status, 403);
    assert.equal(((await rejectNoHeader.json()) as { code: string }).code, 'desktop-required');

    const rejectWithOrigin = await fetch(`${dshOrigin}/dsh-buildr-harness/open`, {
      method: 'POST', headers: { cookie: cookieHeader, 'x-buildr-harness-desktop': '1', origin: dshOrigin }, signal: AbortSignal.timeout(5000),
    });
    assert.equal(rejectWithOrigin.status, 403);

    const missingPeerRes = await fetch(`${dshOrigin}/dsh-buildr-harness/open`, {
      method: 'POST', headers: { cookie: cookieHeader, 'x-buildr-harness-desktop': '1' }, signal: AbortSignal.timeout(10_000),
    });
    assert.equal(missingPeerRes.status, 409);
    assert.equal(((await missingPeerRes.json()) as { code: string }).code, 'harness-not-installed');

    await execFileAsync('npm', ['install', '--prefix', prefix1, '--offline', '--no-audit', '--no-fund', '--ignore-scripts', '--', harnessTarball], {
      cwd: env1Dir, env: env1, timeout: 60_000, maxBuffer: 16 * 1024 * 1024,
    });
    const harnessPkgRoot = path.join(prefix1, 'node_modules', '@buildr-ai', 'buildr-harness');
    const harnessEntry = path.join(harnessPkgRoot, 'bin', 'buildr-harness.mjs');
    const { stopAgentProcess } = await import(pathToFileURL(path.join(harnessPkgRoot, 'build/index.js')).href);
    stopHarness = stopAgentProcess;
    const launcherOut = await execFileAsync(process.execPath, [harnessEntry, 'launcher', 'install'], {
      cwd: env1Dir, env: env1, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(JSON.parse(launcherOut.stdout).status, 'installed');

    const openRes = await fetch(`${dshOrigin}/dsh-buildr-harness/open`, {
      method: 'POST', headers: { cookie: cookieHeader, 'x-buildr-harness-desktop': '1' }, signal: AbortSignal.timeout(45_000),
    });
    assert.equal(openRes.status, 200);
    const handoff = (await openRes.json()) as { origin: string; url: string };
    const ticket = new URLSearchParams(new URL(handoff.url).hash.slice(1)).get('ticket');
    assert.ok(ticket, 'Expected one-time ticket in handoff url');

    const ticketExchange = await fetch(`${handoff.origin}/session/ticket`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: handoff.origin },
      body: JSON.stringify({ ticket }),
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(ticketExchange.status, 200);
    const harnessCookie = ticketExchange.headers.getSetCookie()[0]?.split(';')[0];
    assert.ok(harnessCookie, 'Expected authenticated Harness cookie');

    const guestPage = await fetch(handoff.origin, { headers: { cookie: harnessCookie }, signal: AbortSignal.timeout(10_000) });
    assert.equal(guestPage.status, 200);
    const html = await guestPage.text();
    const assetPath = html.match(/<script[^>]+src="(\/bundles\/[a-f0-9]{64}\/assets\/[^"?]+\.js)"/u)?.[1];
    assert.ok(assetPath, 'Expected bundled Harness Web JS asset in authenticated guest HTML');
    const assetRes = await fetch(`${handoff.origin}${assetPath}`, { headers: { cookie: harnessCookie }, signal: AbortSignal.timeout(10_000) });
    assert.equal(assetRes.status, 200);
    await assetRes.body?.cancel();

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
    const dataRoot2 = path.join(env2Dir, 'harness-data');
    fs.mkdirSync(home2, { recursive: true });
    fs.mkdirSync(dshHome2, { recursive: true });
    const env2 = cleanEnv(home2, dshHome2, dataRoot2);

    await initIsolatedDesktopProfile(dshBin, dshHome2, userData2, env2);
    await execFileAsync(dshCli, ['plugin', '--profile', 'desktop', 'add', `${baseUrl}/${pluginCandidate.file}`], {
      cwd: env2Dir, env: env2, timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
    });
    verifyInstalledPluginMatchesTarball(path.join(dshHome2, 'profiles', 'desktop', 'node_modules', '@buildr-ai', 'dsh-buildr-harness'), pluginTarball);

    const proof = {
      dshVersion,
      harnessVersion: harnessCandidate.version,
      harnessIntegrity: harnessCandidate.integrity,
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
      harnessVersion: harnessCandidate.version,
      harnessIntegrity: harnessCandidate.integrity,
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
    if (stopHarness && harnessDataRoot1) {
      process.env.HOME = harnessHome1;
      process.env.BUILDR_APP_DATA_DIR = harnessDataRoot1;
      try { await stopHarness({ dataRoot: harnessDataRoot1, profileId: 'released', mode: 'if-idle' }); } catch { /* ignore */ }
      if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
      if (prevAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = prevAppData;
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
