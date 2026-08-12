import process from 'node:process';
import { installLauncher, launcherStatus, uninstallLauncher } from '../../../package/launchers/manage.mjs';

export function registerLauncherInterface(runtime) {
  async function manageLocalAppLauncher(action, args) {
    runtime.assertNoUnknownOptions(args, new Set(['--channel', '--target', '--platform', '--json']), new Set(['--json']));
    const options = {
      channel: runtime.optionValue(args, '--channel', 'release'),
      installRoot: runtime.optionValue(args, '--target', undefined),
      platform: runtime.optionValue(args, '--platform', process.platform),
    };
    if (!['release', 'development'].includes(options.channel)) throw new Error(`Invalid launcher channel: ${options.channel}`);
    const result = action === 'install' ? await installLauncher(options) : action === 'uninstall' ? await uninstallLauncher(options) : launcherStatus(options);
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else console.log(result.installed ? `${options.channel} Buildr Web Launcher 已安装：${result.target}` : `${options.channel} Buildr Web Launcher 未安装：${result.target}`);
    return result;
  }
  Object.assign(runtime, { manageLocalAppLauncher });
  return runtime;
}
