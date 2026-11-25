import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dshDesktopContinuity } from './dsh-desktop-continuity.mjs';
import { developmentWebDataRoot } from './development-web-continuity.mjs';

const PLUGINS = [
  {
    id: 'harness',
    service: 'projects/product/services/buildr-harness-dsh-plugin',
    name: '@buildr-ai/dsh-buildr-harness-dev',
    legacyNames: ['@buildr-ai/buildr-harness-dsh-plugin-dev'],
    ownerDir: '.buildr/local/buildr-harness-dsh-plugin',
    archivePrefix: 'dsh-buildr-harness-dev-',
    supportsContinuity: true,
  },
  {
    id: 'development',
    service: 'projects/product/services/buildr-development-dsh-plugin',
    name: '@buildr-ai/dsh-buildr-development-dev',
    legacyNames: ['@buildr-ai/buildr-development-dsh-plugin-dev'],
    ownerDir: '.buildr/local/buildr-development-dsh-plugin',
    archivePrefix: 'dsh-buildr-development-dev-',
    supportsContinuity: false,
  },
];

const hostVersion = '0.2.2-rc.5';
const cli = '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';

function isPluginInput(plugin, file) {
  return file.startsWith(`${plugin.service}/src/`) || [
    'package.json', 'cordis.patch.yml', 'tools/build-dev.ts', 'LICENSE',
  ].some(input => file === `${plugin.service}/${input}`);
}

export function isDshDevelopmentPluginInput(file) {
  return PLUGINS.some(plugin => isPluginInput(plugin, file));
}

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const securePath = file => fs.realpathSync(file) === file;
const readFile = file => {
  if (!securePath(file) || !fs.lstatSync(file).isFile()) throw new Error('DSH 文件身份不匹配。');
  return fs.readFileSync(file);
};
const inside = (parent, file) => file.startsWith(parent + path.sep);
const blocked = reason => ({ status: 'blocked', reason });

function pruneProfileBundle(manifestPath, legacyName) {
  try {
    const manifest = JSON.parse(readFile(manifestPath).toString('utf8'));
    const bundles = manifest?.dsh?.profile?.bundles;
    if (!Array.isArray(bundles) || !bundles.includes(legacyName)) return;
    manifest.dsh.profile.bundles = bundles.filter(entry => entry !== legacyName);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  } catch { /* Non-fatal if profile manifest lacks a bundles array. */ }
}

function updateSinglePlugin(plugin, { root, nodeExecutable, run, environment, platform, hostCli, restartDsh, continuity, home, dshHome, profile, manifest, env, appExited }) {
  const ownerRoot = path.join(root, plugin.ownerDir);
  const installed = path.join(profile, 'node_modules', plugin.name);
  let archive;
  const readBinding = () => {
    const bytes = readFile(manifest);
    const parsed = JSON.parse(bytes);
    const deps = parsed.dependencies || {};
    const present = [plugin.name, ...(plugin.legacyNames || [])].filter(candidate => deps[candidate] !== undefined);
    if (!present.length) return null;
    if (present.length > 1) throw new Error(`DSH 配置同时包含新旧开发插件包（${present.join('、')}），请手动清理后重试。`);
    const activeName = present[0];
    const isLegacy = activeName !== plugin.name;
    const spec = deps[activeName];
    if (typeof spec !== 'string' || !spec.startsWith('file:')) throw new Error('已安装的开发插件不是本工作空间的本地包。');
    const resolved = path.resolve(profile, spec.slice(5));
    if (!inside(ownerRoot, resolved) || !resolved.endsWith('.tgz') || !securePath(resolved) || !fs.lstatSync(resolved).isFile()) throw new Error('已安装的开发插件不属于当前工作空间。');
    const installedDir = path.join(profile, 'node_modules', activeName);
    if (JSON.parse(readFile(path.join(installedDir, 'package.json'))).name !== activeName) throw new Error('无法确认已安装的 DSH 开发插件身份。');
    return { digest: hash(bytes), archive: resolved, activeName, isLegacy, installedDir };
  };
  const matches = (targetArchive, installedDir = installed) => ['package.json', 'cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'lib/launcher.js'].every(file => {
    const expected = run('/usr/bin/tar', ['-xOzf', targetArchive, `package/${file}`], `dsh-verify-${file}`, env, { binary: true }, false);
    return expected.status === 0 && readFile(path.join(installedDir, file)).equals(Buffer.from(expected.stdout));
  });
  let staging;
  try {
    if (!fs.existsSync(manifest)) return { status: 'skipped', reason: '未发现已安装的 DSH 开发插件。' };
    const initial = readBinding();
    if (!initial) return { status: 'skipped', reason: '未发现已安装的 DSH 开发插件。' };
    const host = fs.existsSync(hostCli) && securePath(hostCli) && run(hostCli, ['--version'], 'dsh-host-version', env);
    if (!host || host.status !== 0 || String(host.stdout).trim() !== hostVersion) {
      return blocked('当前 DSH 桌面版本不在开发插件支持范围内。');
    }
    if (!matches(initial.archive, initial.installedDir)) return blocked('已装插件与工作空间绑定的旧包不一致，未覆盖。');
    staging = fs.mkdtempSync(path.join(ownerRoot, 'prepare-'));
    const build = run(nodeExecutable, [path.join(root, plugin.service, 'tools/build-dev.ts'), staging], 'dsh-build-plugin', env);
    if (build.status !== 0) return blocked('构建 DSH 开发插件失败，未更改安装。');
    const output = JSON.parse(String(build.stdout).trim().split('\n').at(-1));
    if (output.name !== plugin.name || path.dirname(output.path) !== staging || !output.path.endsWith('.tgz')) return blocked('DSH 候选包身份不匹配。');
    const bytes = readFile(output.path);
    const identity = hash(bytes);
    archive = path.join(ownerRoot, `${plugin.archivePrefix}${identity}.tgz`);
    if (!fs.existsSync(archive)) fs.copyFileSync(output.path, archive, fs.constants.COPYFILE_EXCL);
    if (hash(readFile(archive)) !== identity) return blocked('DSH 候选包已变化，未更改安装。');
    if (!initial.isLegacy && matches(archive, installed)) return { status: 'unchanged', archive, desktopLoaded: false };
    const originalUnchanged = () => {
      const current = readBinding();
      return current?.digest === initial.digest && current?.activeName === initial.activeName && matches(initial.archive, initial.installedDir);
    };
    const initialEntryDigest = () => hash(readFile(path.join(initial.installedDir, 'lib/index.js')));
    const currentEntryDigest = () => hash(readFile(path.join(installed, 'lib/index.js')));
    if (!originalUnchanged()) return blocked('DSH 安装配置或插件文件在准备期间已变化，未覆盖。');
    let continuityController, verified;
    if (!appExited()) {
      if (!restartDsh || !plugin.supportsContinuity) {
        return { status: 'pending', archive, reason: 'DSH 桌面仍在运行或未确认已退出；候选包已准备。' };
      }
      continuityController = continuity({ root, home, nodeExecutable, dataRoot: developmentWebDataRoot(environment, platform, home), run, env, exited: appExited });
      const quit = continuityController.quit(initialEntryDigest(), originalUnchanged);
      if (quit.status !== 'exited') return { status: 'pending', archive, desktop: quit.status, reason: '未能确认同源 DSH 实例已正常退出；候选包已准备，未换包。' };
      verified = quit.verified;
      if (!originalUnchanged() || !appExited()) return { ...blocked('DSH 退出后配置或运行状态已变化，未换包、未自动重开。'), archive, desktop: 'exited' };
    }
    if (initial.isLegacy) {
      let removeResult;
      try { removeResult = run(hostCli, ['plugin', '--profile', 'desktop', 'remove', initial.activeName], 'dsh-remove-legacy-plugin', env, { timeout: 120000 }); }
      catch { removeResult = { status: 1, errorCode: 'unknown' }; }
      if (removeResult.status !== 0) {
        const restored = verified && !removeResult.signal && !removeResult.errorCode && originalUnchanged() ? continuityController.reopen(verified, initialEntryDigest()) : null;
        return {
          ...blocked('移除旧版 DSH 开发插件失败，未安装新版。'),
          archive,
          ...(verified ? { desktop: restored?.status || 'exited', desktopLoaded: false } : {}),
        };
      }
      pruneProfileBundle(manifest, initial.activeName);
    }
    let result;
    try { result = run(hostCli, ['plugin', '--profile', 'desktop', 'add', '--ignore-scripts', archive], 'dsh-install-plugin', env, { timeout: 120000 }); }
    catch { result = { status: 1, errorCode: 'unknown' }; }
    const after = readBinding();
    if (!after || after.isLegacy || after.activeName !== plugin.name || after.archive !== archive || !matches(archive, installed)) {
      const stillOriginal = verified && !result.signal && !result.errorCode && originalUnchanged();
      const restored = stillOriginal ? continuityController.reopen(verified, initialEntryDigest()) : null;
      return {
        ...blocked(result.status === 0 ? 'DSH 安装结果回读不一致。' : 'DSH 换装未确认；已回读配置，不自动重试。'),
        archive,
        ...(verified ? { desktop: restored?.status || 'exited', desktopLoaded: false } : {}),
      };
    }
    if (verified && (result.signal || result.errorCode)) {
      return { status: 'installed', archive, desktop: 'install-result-unconfirmed', desktopLoaded: false };
    }
    if (verified) {
      const opened = continuityController.reopen(verified, currentEntryDigest());
      return { status: 'installed', archive, desktop: opened.status, desktopLoaded: opened.desktopLoaded };
    }
    return { status: 'installed', archive, desktopLoaded: false };
  } catch (error) {
    return { ...blocked(error instanceof Error ? error.message : '无法核验 DSH 开发插件。'), ...(archive ? { archive } : {}) };
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
  }
}

/** Called only by the retained checkout's self-bootstrap runner, under its lock. */
export function updateDshDevelopmentPlugin({
  root,
  nodeExecutable,
  run,
  environment,
  platform = process.platform,
  hostCli = cli,
  restartDsh = false,
  continuity = dshDesktopContinuity,
  files = /** @type {string[] | null} */ (null),
}) {
  if (platform !== 'darwin') return { status: 'skipped', reason: '本机没有受支持的 macOS DSH 桌面入口。' };
  const home = environment.BUILDR_HOST_HOME || environment.HOME;
  if (!home || !path.isAbsolute(home)) return blocked('无法确认 DSH 的宿主主目录。');
  const dshHome = path.join(home, '.dsh');
  const profile = path.join(dshHome, 'profiles', 'desktop');
  const manifest = path.join(profile, 'package.json');
  const env = { ...environment, HOME: home, DSH_HOME: dshHome, PATH: `${path.dirname(nodeExecutable)}${path.delimiter}${environment.PATH || '/usr/bin:/bin'}` };
  const appExited = () => {
    const check = run('/bin/ps', ['-axo', 'comm='], 'dsh-processes', env);
    return check.status === 0 && Boolean(String(check.stdout).trim()) && !/DeepSeek Harness|dsh-desktop-host/i.test(String(check.stdout));
  };

  const selected = Array.isArray(files) && files.length
    ? PLUGINS.filter(plugin => files.some(file => isPluginInput(plugin, file)))
    : PLUGINS;
  if (!selected.length) return { status: 'skipped', reason: '未命中任何 DSH 开发插件构建输入。' };

  const results = selected.map(plugin => ({
    plugin: plugin.name,
    ...updateSinglePlugin(plugin, { root, nodeExecutable, run, environment, platform, hostCli, restartDsh, continuity, home, dshHome, profile, manifest, env, appExited }),
  }));
  const active = results.filter(item => item.status !== 'skipped');
  if (!active.length) {
    const { plugin: _ignored, ...skipped } = results[0];
    return skipped;
  }
  if (active.length === 1) {
    const { plugin: _ignored, ...single } = active[0];
    return single;
  }
  const blockedResult = active.find(item => item.status === 'blocked');
  if (blockedResult) return { status: 'blocked', reason: blockedResult.reason, plugins: results };
  const pendingResult = active.find(item => item.status === 'pending');
  if (pendingResult) return { status: 'pending', reason: pendingResult.reason, archive: pendingResult.archive, plugins: results };
  const installedResults = active.filter(item => item.status === 'installed');
  if (installedResults.length) {
    const lastInstalled = installedResults.at(-1);
    return {
      status: 'installed',
      archive: lastInstalled.archive,
      desktopLoaded: installedResults.some(item => item.desktopLoaded),
      ...('desktop' in lastInstalled ? { desktop: lastInstalled.desktop } : {}),
      plugins: results,
    };
  }
  return { status: 'unchanged', archive: active.at(-1).archive, desktopLoaded: false, plugins: results };
}
