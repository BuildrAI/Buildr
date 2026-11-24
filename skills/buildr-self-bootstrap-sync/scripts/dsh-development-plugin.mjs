import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dshDesktopContinuity } from './dsh-desktop-continuity.mjs';
import { developmentWebDataRoot } from './development-web-continuity.mjs';

const service = 'projects/product/services/buildr-harness-dsh-plugin';
const name = '@buildr-ai/buildr-harness-dsh-plugin-dev';
const hostVersion = '0.2.2-rc.5';
const cli = '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';

export function isDshDevelopmentPluginInput(file) {
  return file.startsWith(`${service}/src/`) || [
    'package.json', 'cordis.patch.yml', 'tools/build-dev.ts', 'LICENSE',
  ].some(input => file === `${service}/${input}`);
}

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const securePath = file => fs.realpathSync(file) === file;
const readFile = file => {
  if (!securePath(file) || !fs.lstatSync(file).isFile()) throw new Error('DSH 文件身份不匹配。');
  return fs.readFileSync(file);
};
const inside = (parent, file) => file.startsWith(parent + path.sep);
const blocked = reason => ({ status: 'blocked', reason });

/** Called only by the retained checkout's self-bootstrap runner, under its lock. */
export function updateDshDevelopmentPlugin({ root, nodeExecutable, run, environment, platform = process.platform, hostCli = cli, restartDsh = false, continuity = dshDesktopContinuity }) {
  if (platform !== 'darwin') return { status: 'skipped', reason: '本机没有受支持的 macOS DSH 桌面入口。' };
  const home = environment.BUILDR_HOST_HOME || environment.HOME;
  if (!home || !path.isAbsolute(home)) return blocked('无法确认 DSH 的宿主主目录。');
  const dshHome = path.join(home, '.dsh');
  const profile = path.join(dshHome, 'profiles', 'desktop');
  const manifest = path.join(profile, 'package.json');
  const ownerRoot = path.join(root, '.buildr/local/buildr-harness-dsh-plugin');
  const installed = path.join(profile, 'node_modules', name);
  const env = { ...environment, HOME: home, DSH_HOME: dshHome, PATH: `${path.dirname(nodeExecutable)}${path.delimiter}${environment.PATH || '/usr/bin:/bin'}` };
  const appExited = () => {
    const check = run('/bin/ps', ['-axo', 'comm='], 'dsh-processes', env);
    return check.status === 0 && Boolean(String(check.stdout).trim()) && !/DeepSeek Harness|dsh-desktop-host/i.test(String(check.stdout));
  };
  let archive;
  const readBinding = () => {
    const bytes = readFile(manifest);
    const spec = JSON.parse(bytes).dependencies?.[name];
    if (spec === undefined) return null;
    if (typeof spec !== 'string' || !spec.startsWith('file:')) throw new Error('已安装的开发插件不是本工作空间的本地包。');
    const archive = path.resolve(profile, spec.slice(5));
    if (!inside(ownerRoot, archive) || !archive.endsWith('.tgz') || !securePath(archive) || !fs.lstatSync(archive).isFile()) throw new Error('已安装的开发插件不属于当前工作空间。');
    if (JSON.parse(readFile(path.join(installed, 'package.json'))).name !== name) throw new Error('无法确认已安装的 DSH 开发插件身份。');
    return { digest: hash(bytes), archive };
  };
  const matches = archive => ['package.json', 'cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'lib/launcher.js'].every(file => {
    const expected = run('/usr/bin/tar', ['-xOzf', archive, `package/${file}`], `dsh-verify-${file}`, env, { binary: true }, false);
    return expected.status === 0 && readFile(path.join(installed, file)).equals(Buffer.from(expected.stdout));
  });
  let staging;
  try {
    if (!fs.existsSync(manifest)) return { status: 'skipped', reason: '未发现已安装的 DSH 开发插件。' };
    const initial = readBinding();
    if (!initial) return { status: 'skipped', reason: '未发现已安装的 DSH 开发插件。' };
    const host = fs.existsSync(hostCli) && securePath(hostCli) && run(hostCli, ['--version'], 'dsh-host-version', env);
    if (!host || host.status !== 0 || String(host.stdout).trim() !== hostVersion)
      return blocked('当前 DSH 桌面版本不在开发插件支持范围内。');
    if (!matches(initial.archive)) return blocked('已装插件与工作空间绑定的旧包不一致，未覆盖。');
    staging = fs.mkdtempSync(path.join(ownerRoot, 'prepare-'));
    const build = run(nodeExecutable, [path.join(root, service, 'tools/build-dev.ts'), staging], 'dsh-build-plugin', env);
    if (build.status !== 0) return blocked('构建 DSH 开发插件失败，未更改安装。');
    const output = JSON.parse(String(build.stdout).trim().split('\n').at(-1));
    if (output.name !== name || path.dirname(output.path) !== staging || !output.path.endsWith('.tgz')) return blocked('DSH 候选包身份不匹配。');
    const bytes = readFile(output.path);
    const identity = hash(bytes);
    archive = path.join(ownerRoot, `buildr-harness-dsh-plugin-dev-${identity}.tgz`);
    if (!fs.existsSync(archive)) fs.copyFileSync(output.path, archive, fs.constants.COPYFILE_EXCL);
    if (hash(readFile(archive)) !== identity) return blocked('DSH 候选包已变化，未更改安装。');
    if (matches(archive)) return { status: 'unchanged', archive, desktopLoaded: false };
    const originalUnchanged = () => readBinding()?.digest === initial.digest && matches(initial.archive);
    const entryDigest = () => hash(readFile(path.join(installed, 'lib/index.js')));
    if (!originalUnchanged()) return blocked('DSH 安装配置或插件文件在准备期间已变化，未覆盖。');
    let continuityController, verified;
    if (!appExited()) {
      if (!restartDsh) return { status: 'pending', archive, reason: 'DSH 桌面仍在运行或未确认已退出；候选包已准备。' };
      continuityController = continuity({ root, home, nodeExecutable, dataRoot: developmentWebDataRoot(environment, platform, home), run, env, exited: appExited });
      const quit = continuityController.quit(entryDigest(), originalUnchanged);
      if (quit.status !== 'exited') return { status: 'pending', archive, desktop: quit.status, reason: '未能确认同源 DSH 实例已正常退出；候选包已准备，未换包。' };
      verified = quit.verified;
      if (!originalUnchanged() || !appExited()) return { ...blocked('DSH 退出后配置或运行状态已变化，未换包、未自动重开。'), archive, desktop: 'exited' };
    }
    let result;
    try { result = run(hostCli, ['plugin', '--profile', 'desktop', 'add', '--ignore-scripts', archive], 'dsh-install-plugin', env, { timeout: 120000 }); }
    catch { result = { status: 1, errorCode: 'unknown' }; }
    // Reconcile even if the CLI exits nonzero; never repeat an uncertain installation.
    const after = readBinding();
    if (after?.archive !== archive || !matches(archive)) {
      const restored = verified && !result.signal && !result.errorCode && originalUnchanged() ? continuityController.reopen(verified, entryDigest()) : null;
      return { ...blocked(result.status === 0 ? 'DSH 安装结果回读不一致。' : 'DSH 换装未确认；已回读配置，不自动重试。'), archive, ...(verified ? { desktop: restored?.status || 'exited', desktopLoaded: false } : {}) };
    }
    if (verified && (result.signal || result.errorCode)) {
      return { status: 'installed', archive, desktop: 'install-result-unconfirmed', desktopLoaded: false };
    }
    if (verified) {
      const opened = continuityController.reopen(verified, entryDigest());
      return { status: 'installed', archive, desktop: opened.status, desktopLoaded: opened.desktopLoaded };
    }
    return { status: 'installed', archive, desktopLoaded: false };
  } catch (error) {
    return { ...blocked(error instanceof Error ? error.message : '无法核验 DSH 开发插件。'), ...(archive ? { archive } : {}) };
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
  }
}
