/** Raise this verified desktop installation through its supported native open URL. */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { desktopFault } from './desktop-navigation.ts';

const ACTIVATION_TIMEOUT_MS = 3000;
type WindowRunner = (command: string, args: string[], options: {
  signal: AbortSignal; timeout: number; shell: false; maxBuffer: number; encoding: 'utf8'; windowsHide: true;
}) => Promise<void>;
const runWindowCommand: WindowRunner = (command, args, options) => new Promise((resolve, reject) => {
  execFile(command, args, options, error => { if (error) reject(error); else resolve(); });
});

export async function activateDesktopWindow(appPath: string, signal: AbortSignal,
  options: { platform?: NodeJS.Platform; timeoutMs?: number; run?: WindowRunner } = {}): Promise<void> {
  signal.throwIfAborted();
  if ((options.platform ?? process.platform) !== 'darwin')
    throw desktopFault('window_activation_unsupported', '当前系统没有经过验证的 DSH 窗口唤起能力。');
  if (!path.isAbsolute(appPath) || !appPath.endsWith('.app') || /[\u0000-\u001f\u007f]/.test(appPath))
    throw desktopFault('window_activation_invalid', 'DSH 桌面安装路径无效。');
  const timeoutMs = options.timeoutMs ?? ACTIVATION_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > ACTIVATION_TIMEOUT_MS)
    throw desktopFault('window_activation_invalid', 'DSH 窗口唤起时限无效。');
  const lifetime = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => lifetime.removeEventListener('abort', abort);
      const abort = () => { cleanup(); reject(lifetime.reason); };
      lifetime.addEventListener('abort', abort, { once: true });
      if (lifetime.aborted) { abort(); return; }
      // -a binds the URL to this exact application rather than the system's protocol default.
      // This requests the existing owner's primary window; it never starts a generation Host.
      (options.run ?? runWindowCommand)('/usr/bin/open', ['-a', appPath, 'dsh://open'], {
        signal: lifetime, timeout: timeoutMs, shell: false, maxBuffer: 64 * 1024, encoding: 'utf8', windowsHide: true,
      }).then(() => { cleanup(); resolve(); }, error => { cleanup(); reject(error); });
    });
    lifetime.throwIfAborted();
  } catch {
    if (signal.aborted) throw signal.reason;
    throw desktopFault('window_activation_failed', 'DSH 桌面窗口未能唤起，请重试。');
  }
}
