import { readNpmUpdateHandoffInstallation } from '../infrastructure/current-product-identity.ts';
import { assertCurrentNpmLauncherBinding, npmLauncherStatus, refreshInstalledNpmLauncher } from '../infrastructure/npm-launcher.ts';
import { updateError, type UpdateRecord } from './update-flow-state.ts';

export type LauncherResult = { status: 'ready' | 'absent' | 'failed'; error?: { code: string; message: string } };
export type UpdateLauncher = { inspect(job: UpdateRecord): LauncherResult; repair(job: UpdateRecord): LauncherResult };

/** Reuses the existing slot/receipt checks and launcher owner. Never creates a missing launcher. */
export function createUpdateLauncher(options: { platform?: NodeJS.Platform; target?: string; readShortcut?: any; writeShortcut?: any } = {}): UpdateLauncher {
  function target(job: UpdateRecord) {
    return readNpmUpdateHandoffInstallation({ productRoot: job.productRoot, expectedVersion: job.version,
      previousInstallationIdentity: job.previousInstallationIdentity || undefined });
  }
  function inspect(job: UpdateRecord): LauncherResult {
    const { entry } = target(job);
    if (!['darwin', 'win32'].includes(options.platform || process.platform)) return { status: 'absent' };
    const status = npmLauncherStatus(options);
    if (status.status === 'absent' || status.status === 'unsupported') return { status: 'absent' };
    try {
      assertCurrentNpmLauncherBinding(status.bindingPath, { ...entry.origin, installationIdentity: entry.origin.ownershipIdentity });
      if (status.status !== 'ready') throw updateError('update_launcher_invalid', '桌面启动入口与记录的内容不一致。');
      return { status: 'ready' };
    } catch (cause: any) {
      return { status: 'failed', error: { code: cause.code || 'update_launcher_failed', message: cause.message } };
    }
  }
  return {
    inspect,
    repair(job) {
      const { entry } = target(job);
      const before = inspect(job);
      if (before.status !== 'failed') return before;
      try {
        const result = refreshInstalledNpmLauncher({ ...options, registration: { status: 'installed', entry } });
        if (result.action === 'blocked') throw updateError('update_launcher_ownership_conflict', 'reason' in result ? result.reason : '无法更新当前启动入口。');
        return inspect(job);
      } catch (cause: any) {
        return { status: 'failed', error: { code: cause.code || 'update_launcher_repair_failed', message: cause.message } };
      }
    },
  };
}
