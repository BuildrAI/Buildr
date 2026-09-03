import process from 'node:process';

import { findRegisteredProductInstallation } from '../../infrastructure/installation-registry.ts';
import {
  installNpmLauncher,
  npmLauncherStatus,
  repairNpmLauncher,
  uninstallNpmLauncher,
} from '../../infrastructure/npm-launcher.ts';
import { readApplicationPayloadManifest, resolveApplicationPayloadRoot } from '../../../../infrastructure/product-resources/index.ts';
import { readCurrentInstallationOrigin } from '../../infrastructure/installation-origin.ts';

function currentNpmRegistration(runtime: any) {
  const productRoot = runtime.productRoot();
  const payloadRoot = resolveApplicationPayloadRoot({ required: true });
  const origin = readCurrentInstallationOrigin(productRoot, {
    payloadRoot,
    payloadManifest: readApplicationPayloadManifest(payloadRoot),
  });
  if (origin.channel !== 'npm') {
    const error: Error & Record<string, any> = new Error(`Buildr Web Launcher management requires a verified npm installation; current channel is ${origin.channel}.`);
    error.code = 'launcher.npm_installation_required';
    throw error;
  }
  const registration = findRegisteredProductInstallation(origin, {
    productRoot,
    envelopePath: origin.receipt?.file,
    entryPath: process.env.BUILDR_NPM_ENTRY_PATH,
  });
  if (registration?.status !== 'installed') {
    const error: Error & Record<string, any> = new Error(`The npm installation registry is ${registration?.status || 'absent'}: ${registration?.reason || 'run npm install again to enroll exact Host Node/npm prefix authority'}.`);
    error.code = 'launcher.npm_registration_required';
    throw error;
  }
  return registration;
}

function printLauncherResult(result: any) {
  const location = result.target || '-';
  if (result.status === 'ready') console.log(`npm Buildr Web Launcher ready: ${location}`);
  else if (result.status === 'absent') console.log(`npm Buildr Web Launcher absent: ${location}`);
  else console.log(`npm Buildr Web Launcher ${result.status}: ${result.diagnostic?.message || location}`);
  for (const action of result.nextActions || []) console.log(`next: ${action}`);
}

export function registerLauncherInterface(runtime: any) {
  function manageBuildrWebLauncher(action: any, args: any) {
    const supportsPort = ['install', 'repair'].includes(action);
    runtime.assertNoUnknownOptions(args, new Set(['--target', '--platform', '--json', ...(supportsPort ? ['--port'] : [])]), new Set(['--json']));
    const rawPort = supportsPort ? runtime.optionValue(args, '--port', undefined) : undefined;
    const port = rawPort === undefined ? undefined : Number(rawPort);
    if (rawPort !== undefined && (!Number.isInteger(port) || (port as number) < 0 || (port as number) > 65535)) throw new Error(`Invalid npm Launcher port: ${rawPort}.`);
    const options = {
      target: runtime.optionValue(args, '--target', undefined),
      platform: runtime.optionValue(args, '--platform', process.platform),
      port,
    };
    let result;
    if (action === 'status') result = npmLauncherStatus(options);
    else {
      const registration = currentNpmRegistration(runtime);
      if (action === 'install') result = installNpmLauncher({ ...options, registration });
      else if (action === 'repair') result = repairNpmLauncher({ ...options, registration });
      else if (action === 'uninstall') result = uninstallNpmLauncher({ ...options, registration });
      else throw new Error(`Unsupported Launcher action: ${action}.`);
    }
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else printLauncherResult(result);
    if (['stale', 'invalid'].includes(result.status)) process.exitCode = 1;
    return result;
  }
  Object.assign(runtime, { manageBuildrWebLauncher });
  return runtime;
}

export function createLauncherCliContributions() {
  return Object.freeze([
    {
      key: 'web launcher install',
      surface: 'primary',
      summary: '从当前已验证的 npm installation 显式生成不复制 Node 或 package 的 Buildr Web Launcher。',
      help: [
        'Usage: buildr web launcher install [--target <path>] [--port <0..65535>] [--json]',
        '',
        'macOS 生成本机 Buildr Web.app，Windows 生成 Start Menu shortcut；两者只绑定已登记的 Host Node、package entry、npm prefix 与 installation identity。',
        '默认首选 127.0.0.1:4457；--port 0 直接使用随机 loopback 端口，非零首选端口占用时只随机回退一次。',
        '普通 npm install 不会创建图形入口；已有同 ownership Launcher 才会在 npm 更新后刷新 binding。',
      ],
      match: ({ domain, action, runtimeId }: any) => domain === 'web' && action === 'launcher' && runtimeId === 'install',
      run: (runtime: any, context: any) => runtime.manageBuildrWebLauncher('install', context.argv.slice(5)),
    },
    {
      key: 'web launcher status',
      surface: 'primary',
      summary: '只读验证 npm Buildr Web Launcher 的 binding、Host Node、package entry、prefix 与 ownership。',
      help: [
        'Usage: buildr web launcher status [--target <path>] [--json]',
        '',
        '任何路径或摘要漂移都会 fail closed；不会从 PATH 查找替代 Buildr。',
      ],
      match: ({ domain, action, runtimeId }: any) => domain === 'web' && action === 'launcher' && runtimeId === 'status',
      run: (runtime: any, context: any) => runtime.manageBuildrWebLauncher('status', context.argv.slice(5)),
    },
    {
      key: 'web launcher repair',
      surface: 'primary',
      summary: '从同一已登记 npm installation 原子重建当前 owned Launcher binding。',
      help: [
        'Usage: buildr web launcher repair [--target <path>] [--port <0..65535>] [--json]',
        '',
        'repair 只接受同一 installation slot 拥有的现有 Launcher；不会接管 foreign target 或改绑到 PATH 中的其他 Buildr。',
        '省略 --port 时保留 v2 binding 的现有策略；从 v1 迁移时采用默认首选端口 4457。',
      ],
      match: ({ domain, action, runtimeId }: any) => domain === 'web' && action === 'launcher' && runtimeId === 'repair',
      run: (runtime: any, context: any) => runtime.manageBuildrWebLauncher('repair', context.argv.slice(5)),
    },
    {
      key: 'web launcher uninstall',
      surface: 'primary',
      summary: '只移除 ownership 精确匹配的 npm Buildr Web Launcher，保留 npm package 与 Workspace 数据。',
      help: [
        'Usage: buildr web launcher uninstall [--target <path>] [--json]',
        '',
        'foreign target 或 binding 会被保留并 fail closed；本命令不卸载 npm Buildr、Workspace Registry、SQLite、日志或 Workspace data。',
      ],
      match: ({ domain, action, runtimeId }: any) => domain === 'web' && action === 'launcher' && runtimeId === 'uninstall',
      run: (runtime: any, context: any) => runtime.manageBuildrWebLauncher('uninstall', context.argv.slice(5)),
    },
  ].map(Object.freeze));
}
