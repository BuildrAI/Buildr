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

function createPluginHelper(plugin, { root, profile, manifest, run, env }) {
  const ownerRoot = path.join(root, plugin.ownerDir);
  const installed = path.join(profile, 'node_modules', plugin.name);
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
  return { plugin, ownerRoot, installed, readBinding, matches };
}

function preparePluginCandidate(plugin, context) {
  const { root, nodeExecutable, run, hostCli, manifest, env } = context;
  const helper = createPluginHelper(plugin, context);
  let archive, staging;
  try {
    if (!fs.existsSync(manifest)) return { plugin: plugin.name, status: 'skipped', reason: '未发现已安装的 DSH 开发插件。' };
    const initial = helper.readBinding();
    if (!initial) return { plugin: plugin.name, status: 'skipped', reason: '未发现已安装的 DSH 开发插件。' };
    const host = fs.existsSync(hostCli) && securePath(hostCli) && run(hostCli, ['--version'], 'dsh-host-version', env);
    if (!host || host.status !== 0 || String(host.stdout).trim() !== hostVersion) {
      return { plugin: plugin.name, ...blocked('当前 DSH 桌面版本不在开发插件支持范围内。') };
    }
    if (!helper.matches(initial.archive, initial.installedDir)) {
      return { plugin: plugin.name, ...blocked('已装插件与工作空间绑定的旧包不一致，未覆盖。') };
    }
    staging = fs.mkdtempSync(path.join(helper.ownerRoot, 'prepare-'));
    const build = run(nodeExecutable, [path.join(root, plugin.service, 'tools/build-dev.ts'), staging], 'dsh-build-plugin', env);
    if (build.status !== 0) return { plugin: plugin.name, ...blocked('构建 DSH 开发插件失败，未更改安装。') };
    const output = JSON.parse(String(build.stdout).trim().split('\n').at(-1));
    if (output.name !== plugin.name || path.dirname(output.path) !== staging || !output.path.endsWith('.tgz')) {
      return { plugin: plugin.name, ...blocked('DSH 候选包身份不匹配。') };
    }
    const bytes = readFile(output.path);
    const identity = hash(bytes);
    archive = path.join(helper.ownerRoot, `${plugin.archivePrefix}${identity}.tgz`);
    if (!fs.existsSync(archive)) fs.copyFileSync(output.path, archive, fs.constants.COPYFILE_EXCL);
    if (hash(readFile(archive)) !== identity) return { plugin: plugin.name, ...blocked('DSH 候选包已变化，未更改安装。'), archive };
    if (!initial.isLegacy && helper.matches(archive, helper.installed)) {
      return { plugin: plugin.name, status: 'unchanged', archive, desktopLoaded: false, _helper: helper, _initial: initial };
    }
    return { plugin: plugin.name, status: 'prepared', archive, _helper: helper, _initial: initial };
  } catch (error) {
    return { plugin: plugin.name, ...blocked(error instanceof Error ? error.message : '无法核验 DSH 开发插件。'), ...(archive ? { archive } : {}) };
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
  }
}

function summarizeResults(rawResults) {
  const results = rawResults.map(({ _helper, _initial, ...clean }) => clean);
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
  if (blockedResult) {
    return {
      status: 'blocked',
      reason: blockedResult.reason,
      ...('archive' in blockedResult ? { archive: blockedResult.archive } : {}),
      ...('desktop' in blockedResult ? { desktop: blockedResult.desktop } : {}),
      plugins: results,
    };
  }
  const pendingResult = active.find(item => item.status === 'pending');
  if (pendingResult) {
    return {
      status: 'pending',
      reason: pendingResult.reason,
      archive: pendingResult.archive,
      ...('desktop' in pendingResult ? { desktop: pendingResult.desktop } : {}),
      plugins: results,
    };
  }
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

  const sharedContext = { root, nodeExecutable, run, hostCli, profile, manifest, env };
  const results = selected.map(plugin => preparePluginCandidate(plugin, sharedContext));
  const active = results.filter(item => item.status !== 'skipped');
  if (!active.length || active.some(item => item.status === 'blocked')) {
    return summarizeResults(results);
  }

  const pendingIndices = results.flatMap((item, index) => item.status === 'prepared' ? [index] : []);
  if (!pendingIndices.length) {
    return summarizeResults(results);
  }

  const setAllPending = (update) => {
    for (const index of pendingIndices) {
      const current = results[index];
      results[index] = { plugin: current.plugin, archive: current.archive, ...update(current) };
    }
    return summarizeResults(results);
  };

  try {
    const pendingItems = pendingIndices.map(index => ({ index, ...results[index] }));
    let continuityAnchor = pendingItems.find(item => item._helper.plugin.supportsContinuity) || null;
    if (!continuityAnchor) {
      const unchangedAnchor = results.find(item => item._helper?.plugin?.supportsContinuity);
      if (unchangedAnchor) {
        continuityAnchor = unchangedAnchor;
      } else {
        const continuityPlugin = PLUGINS.find(plugin => plugin.supportsContinuity);
        if (continuityPlugin && fs.existsSync(manifest)) {
          const helper = createPluginHelper(continuityPlugin, sharedContext);
          const initial = helper.readBinding();
          if (initial && helper.matches(initial.archive, initial.installedDir)) {
            continuityAnchor = { _helper: helper, _initial: initial };
          }
        }
      }
    }

    const baseManifestDigest = hash(readFile(manifest));
    const monitoredItems = continuityAnchor && !pendingItems.some(item => item._helper.plugin.name === continuityAnchor._helper.plugin.name)
      ? [...pendingItems, continuityAnchor]
      : pendingItems;
    const itemBindingMatches = (item, expectedManifestDigest) => {
      const current = item._helper.readBinding();
      return Boolean(
        current
        && current.digest === expectedManifestDigest
        && current.activeName === item._initial.activeName
        && current.archive === item._initial.archive
        && item._helper.matches(item._initial.archive, item._initial.installedDir),
      );
    };
    const allOriginalUnchanged = () => monitoredItems.every(item => itemBindingMatches(item, baseManifestDigest));
    const entryDigest = (item, dir) => hash(readFile(path.join(dir, 'lib/index.js')));
    const anchorIsPending = continuityAnchor ? pendingItems.some(item => item._helper.plugin.name === continuityAnchor._helper.plugin.name) : false;
    const anchorInitialEntryDigest = () => entryDigest(continuityAnchor, continuityAnchor._initial.installedDir);
    const anchorCurrentEntryDigest = () => entryDigest(continuityAnchor, anchorIsPending ? continuityAnchor._helper.installed : continuityAnchor._initial.installedDir);

    if (!allOriginalUnchanged()) {
      return setAllPending(() => blocked('DSH 安装配置或插件文件在准备期间已变化，未覆盖。'));
    }

    let continuityController, verified;
    if (!appExited()) {
      if (!restartDsh) {
        return setAllPending(() => ({ status: 'pending', reason: 'DSH 桌面仍在运行或未确认已退出；候选包已准备。' }));
      }
      if (!continuityAnchor) {
        return setAllPending(() => ({ status: 'pending', reason: '未能确认同源 DSH 实例已正常退出；候选包已准备，未换包。' }));
      }
      continuityController = continuity({
        root,
        home,
        nodeExecutable,
        dataRoot: developmentWebDataRoot(environment, platform, home),
        run,
        env,
        exited: appExited,
      });
      const quit = continuityController.quit(anchorInitialEntryDigest(), allOriginalUnchanged);
      if (quit.status !== 'exited') {
        return setAllPending(() => ({ status: 'pending', desktop: quit.status, reason: '未能确认同源 DSH 实例已正常退出；候选包已准备，未换包。' }));
      }
      verified = quit.verified;
      if (!allOriginalUnchanged() || !appExited()) {
        return setAllPending(() => ({ ...blocked('DSH 退出后配置或运行状态已变化，未换包、未自动重开。'), desktop: 'exited' }));
      }
    }

    let expectedManifestDigest = baseManifestDigest;
    let anyMutated = false;
    let unconfirmedInstall = false;

    for (let pos = 0; pos < pendingItems.length; pos++) {
      const item = pendingItems[pos];
      if ((verified && !appExited()) || !itemBindingMatches(item, expectedManifestDigest)) {
        const failReason = 'DSH 退出后配置或运行状态已变化，未换包、未自动重开。';
        const restored = verified && !anyMutated && allOriginalUnchanged()
          ? continuityController.reopen(verified, anchorInitialEntryDigest())
          : null;
        const desktop = verified ? (restored?.status || 'exited') : undefined;
        for (let k = pos; k < pendingItems.length; k++) {
          const rem = pendingItems[k];
          results[rem.index] = {
            plugin: rem.plugin,
            ...blocked(failReason),
            archive: rem.archive,
            ...(verified ? { desktop, desktopLoaded: false } : {}),
          };
        }
        return summarizeResults(results);
      }

      if (item._initial.isLegacy) {
        let removeResult;
        try { removeResult = run(hostCli, ['plugin', '--profile', 'desktop', 'remove', item._initial.activeName], 'dsh-remove-legacy-plugin', env, { timeout: 120000 }); }
        catch { removeResult = { status: 1, errorCode: 'unknown' }; }
        if (removeResult.status !== 0) {
          const restored = verified && !anyMutated && !removeResult.signal && !removeResult.errorCode && allOriginalUnchanged()
            ? continuityController.reopen(verified, anchorInitialEntryDigest())
            : null;
          const desktop = verified ? (restored?.status || 'exited') : undefined;
          for (let k = pos; k < pendingItems.length; k++) {
            const rem = pendingItems[k];
            results[rem.index] = {
              plugin: rem.plugin,
              ...blocked('移除旧版 DSH 开发插件失败，未安装新版。'),
              archive: rem.archive,
              ...(verified ? { desktop, desktopLoaded: false } : {}),
            };
          }
          return summarizeResults(results);
        }
        pruneProfileBundle(manifest, item._initial.activeName);
        anyMutated = true;
      }

      let result;
      try { result = run(hostCli, ['plugin', '--profile', 'desktop', 'add', '--ignore-scripts', item.archive], 'dsh-install-plugin', env, { timeout: 120000 }); }
      catch { result = { status: 1, errorCode: 'unknown' }; }
      const after = item._helper.readBinding();
      if (!after || after.isLegacy || after.activeName !== item._helper.plugin.name || after.archive !== item.archive || !item._helper.matches(item.archive, item._helper.installed)) {
        const stillOriginal = verified && !anyMutated && !result.signal && !result.errorCode && allOriginalUnchanged();
        const restored = stillOriginal ? continuityController.reopen(verified, anchorInitialEntryDigest()) : null;
        const desktop = verified ? (restored?.status || 'exited') : undefined;
        const reason = result.status === 0 ? 'DSH 安装结果回读不一致。' : 'DSH 换装未确认；已回读配置，不自动重试。';
        for (let k = pos; k < pendingItems.length; k++) {
          const rem = pendingItems[k];
          results[rem.index] = {
            plugin: rem.plugin,
            ...blocked(reason),
            archive: rem.archive,
            ...(verified ? { desktop, desktopLoaded: false } : {}),
          };
        }
        return summarizeResults(results);
      }

      anyMutated = true;
      expectedManifestDigest = after.digest;
      if (verified && (result.signal || result.errorCode)) {
        unconfirmedInstall = true;
      }
      results[item.index] = {
        plugin: item.plugin,
        status: 'installed',
        archive: item.archive,
        desktopLoaded: false,
      };
    }

    if (verified) {
      if (unconfirmedInstall) {
        for (const item of pendingItems) {
          results[item.index] = {
            ...results[item.index],
            desktop: 'install-result-unconfirmed',
            desktopLoaded: false,
          };
        }
        return summarizeResults(results);
      }
      const opened = continuityController.reopen(verified, anchorCurrentEntryDigest());
      for (const item of pendingItems) {
        results[item.index] = {
          ...results[item.index],
          desktop: opened.status,
          desktopLoaded: item._helper.plugin.supportsContinuity ? opened.desktopLoaded : false,
        };
      }
    }
    return summarizeResults(results);
  } catch (error) {
    return setAllPending(() => blocked(error instanceof Error ? error.message : '无法核验 DSH 开发插件。'));
  }
}
