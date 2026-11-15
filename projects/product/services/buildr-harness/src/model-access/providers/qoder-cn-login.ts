import { existsSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { bounded, closeOwnedProcess, findExecutable, inspectVersion, nativeCommand, privateDirectories } from '../../executors/native-process.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../../executors/program-policy.ts';
import { qoderProduct, type QoderProductId } from '../../executors/qoder/product.ts';
import type { LoginObservation } from '../../contracts.ts';

/** The CN model account owns its login so it never depends on a prepared agent. */
export const qoderCnProduct = qoderProduct('qoder-cn');

export interface QoderCnLoginSession {
  child: ChildProcessWithoutNullStreams;
  cancelled: boolean;
  update: (value: LoginObservation) => void;
}
export type QoderAccountLoginSession = QoderCnLoginSession;

/** Run the official CLI login for a standalone Qoder/Qoder CN account inside its private config root. */
export async function beginQoderAccountLogin(
  productId: QoderProductId,
  config: string,
  environment: NodeJS.ProcessEnv,
  update: (value: LoginObservation) => void,
  started: (session: QoderAccountLoginSession) => void,
  finished: () => void,
  options: { executable?: string; signal?: AbortSignal } = {},
): Promise<void> {
  const product = qoderProduct(productId);
  update({ state: 'initializing' });
  let executable: string;
  try { executable = await findExecutable(options.executable, product.executableNames, environment); }
  catch { update({ state: 'failed', diagnostic: `未找到 ${product.label} 命令行程序，请先安装 ${product.executableNames[0]} 后重试。` }); return; }
  let version: string;
  try { version = await inspectVersion(executable, environment); }
  catch { update({ state: 'failed', diagnostic: `${product.label} 命令行程序无法运行，请重新安装后重试。` }); return; }
  if (!isCompatibleProgram(productId, version)) {
    update({ state: 'failed', diagnostic: `${product.label} 程序版本 ${version} 不在兼容范围 ${nativeProgramPolicy(productId).compatibility} 内。` });
    return;
  }
  await privateDirectories(config);
  options.signal?.throwIfAborted();
  const command = nativeCommand(executable);
  const child = spawn(command.command, [...command.prefix, 'login'], {
    cwd: config,
    env: { ...environment, [product.configEnvironment]: config, BROWSER: process.platform === 'win32' ? 'cmd /c exit 1' : '/usr/bin/false' },
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const session: QoderAccountLoginSession = { child, cancelled: false, update };
  started(session);
  let text = '', currentUrl = '';
  const read = (chunk: Buffer) => {
    if (session.cancelled) return;
    text = (text + chunk.toString()).slice(-65536).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    for (const value of text.match(/https:\/\/[^\s"'<>]+/g) ?? []) {
      let url: URL; try { url = new URL(value); } catch { continue; }
      if (product.loginHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host)) && value !== currentUrl) {
        currentUrl = value; update({ state: 'waiting-browser', url: url.href });
      }
    }
  };
  child.stdout.on('data', read); child.stderr.on('data', read);
  try {
    const status = await bounded(new Promise<number | null>((resolve, reject) => {
      child.once('exit', resolve); child.once('error', () => reject(new Error(productId === 'qoder-cn' ? 'qoder_cn_login_failed' : 'qoder_login_failed')));
    }), 15 * 60 * 1000);
    if (session.cancelled) return;
    if (status !== 0) {
      update({ state: 'failed', diagnostic: currentUrl ? '登录未完成，请重新发起登录。' : '登录未完成，请检查网络后重新发起。' });
      return;
    }
    update({ state: 'completed' });
  } catch {
    if (!session.cancelled) { await closeOwnedProcess(child); update({ state: 'expired', diagnostic: '登录等待超时，请重新发起登录。' }); }
  } finally { finished(); }
}

export async function beginQoderCnLogin(
  config: string,
  environment: NodeJS.ProcessEnv,
  update: (value: LoginObservation) => void,
  started: (session: QoderCnLoginSession) => void,
  finished: () => void,
  options: { executable?: string; signal?: AbortSignal } = {},
): Promise<void> {
  await beginQoderAccountLogin('qoder-cn', config, environment, update, started, finished, options);
}

export async function cancelQoderCnLogin(session: QoderCnLoginSession | undefined, current: () => boolean): Promise<void> {
  if (!session || session.cancelled) return;
  session.cancelled = true;
  await closeOwnedProcess(session.child);
  if (current()) session.update({ state: 'cancelled' });
}
export const cancelQoderAccountLogin = cancelQoderCnLogin;

/** Only an absolute private config root is accepted; credentials never leave this directory. */
export function qoderAccountConfigRoot(productId: QoderProductId, accountRoot: string): string {
  const config = join(accountRoot, qoderProduct(productId).configDirectory);
  if (!isAbsolute(config)) throw new Error(productId === 'qoder-cn' ? 'qoder_cn_config_invalid' : 'qoder_config_invalid');
  return config;
}

export function qoderCnConfigRoot(accountRoot: string): string {
  return qoderAccountConfigRoot('qoder-cn', accountRoot);
}

export function qoderAccountProgramPresent(productId: QoderProductId, environment: NodeJS.ProcessEnv): boolean {
  for (const name of qoderProduct(productId).executableNames) {
    const directory = (environment.PATH ?? '').split(process.platform === 'win32' ? ';' : ':').find(item => isAbsolute(item) && existsSync(join(item, name)));
    if (directory) return true;
  }
  return false;
}

export function qoderCnProgramPresent(environment: NodeJS.ProcessEnv): boolean {
  return qoderAccountProgramPresent('qoder-cn', environment);
}
