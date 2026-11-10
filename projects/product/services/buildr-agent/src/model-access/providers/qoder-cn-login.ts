import { existsSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { bounded, closeOwnedProcess, findExecutable, inspectVersion, nativeCommand, privateDirectories } from '../../executors/native-process.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../../executors/program-policy.ts';
import { qoderProduct } from '../../executors/qoder/product.ts';
import type { LoginObservation } from '../../contracts.ts';

/** The CN model account owns its login so it never depends on a prepared agent. */
export const qoderCnProduct = qoderProduct('qoder-cn');

export interface QoderCnLoginSession {
  child: ChildProcessWithoutNullStreams;
  cancelled: boolean;
  update: (value: LoginObservation) => void;
}

/** Run the official CN CLI login inside the account's private config root. */
export async function beginQoderCnLogin(
  config: string,
  environment: NodeJS.ProcessEnv,
  update: (value: LoginObservation) => void,
  started: (session: QoderCnLoginSession) => void,
  finished: () => void,
): Promise<void> {
  update({ state: 'initializing' });
  let executable: string;
  try { executable = await findExecutable(undefined, qoderCnProduct.executableNames, environment); }
  catch { update({ state: 'failed', diagnostic: '未找到 Qoder CN 命令行程序，请先安装 qodercn 后重试。' }); return; }
  let version: string;
  try { version = await inspectVersion(executable, environment); }
  catch { update({ state: 'failed', diagnostic: 'Qoder CN 命令行程序无法运行，请重新安装后重试。' }); return; }
  if (!isCompatibleProgram('qoder-cn', version)) {
    update({ state: 'failed', diagnostic: `Qoder CN 程序版本 ${version} 不在兼容范围 ${nativeProgramPolicy('qoder-cn').compatibility} 内。` });
    return;
  }
  await privateDirectories(config);
  const command = nativeCommand(executable);
  const child = spawn(command.command, [...command.prefix, 'login'], {
    cwd: config,
    env: { ...environment, [qoderCnProduct.configEnvironment]: config, BROWSER: process.platform === 'win32' ? 'cmd /c exit 1' : '/usr/bin/false' },
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const session: QoderCnLoginSession = { child, cancelled: false, update };
  started(session);
  let text = '', currentUrl = '';
  const read = (chunk: Buffer) => {
    if (session.cancelled) return;
    text = (text + chunk.toString()).slice(-65536).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    for (const value of text.match(/https:\/\/[^\s"'<>]+/g) ?? []) {
      let url: URL; try { url = new URL(value); } catch { continue; }
      if (qoderCnProduct.loginHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host)) && value !== currentUrl) {
        currentUrl = value; update({ state: 'waiting-browser', url: url.href });
      }
    }
  };
  child.stdout.on('data', read); child.stderr.on('data', read);
  try {
    const status = await bounded(new Promise<number | null>((resolve, reject) => {
      child.once('exit', resolve); child.once('error', () => reject(new Error('qoder_cn_login_failed')));
    }), 15 * 60 * 1000);
    if (session.cancelled) return;
    if (status !== 0) {
      update({ state: 'failed', diagnostic: currentUrl ? '登录未完成，请重新发起登录。' : '登录未完成，请检查网络后重新发起。' });
      return;
    }
    update({ state: 'checking' });
  } catch {
    if (!session.cancelled) { await closeOwnedProcess(child); update({ state: 'expired', diagnostic: '登录等待超时，请重新发起登录。' }); }
  } finally { finished(); }
}

export async function cancelQoderCnLogin(session: QoderCnLoginSession | undefined, current: () => boolean): Promise<void> {
  if (!session || session.cancelled) return;
  session.cancelled = true;
  await closeOwnedProcess(session.child);
  if (current()) session.update({ state: 'cancelled' });
}

/** Only an absolute private config root is accepted; credentials never leave this directory. */
export function qoderCnConfigRoot(accountRoot: string): string {
  const config = join(accountRoot, qoderCnProduct.configDirectory);
  if (!isAbsolute(config)) throw new Error('qoder_cn_config_invalid');
  return config;
}

export function qoderCnProgramPresent(environment: NodeJS.ProcessEnv): boolean {
  for (const name of qoderCnProduct.executableNames) {
    const directory = (environment.PATH ?? '').split(process.platform === 'win32' ? ';' : ':').find(item => isAbsolute(item) && existsSync(join(item, name)));
    if (directory) return true;
  }
  return false;
}
