import type { PermissionMode } from '../../contracts.ts';
import { AgentServiceError, fail } from '../../domain/agent-state.ts';
import { resolvePermissionMode } from '../../domain/permission-mode.ts';
import { bounded } from '../native-process.ts';
import { dshValue } from './client.ts';

export async function dshPermissionCatalog(remote: any): Promise<{ options: Array<{ value: string }>; defaultPreset: string }> {
  const catalog = dshValue(await bounded(remote.permissionPresets.catalog(), 5_000));
  if (!Array.isArray(catalog?.options) || typeof catalog.defaultPreset !== 'string' || !catalog.defaultPreset || !catalog.options.some((option: any) => option.value === catalog.defaultPreset)) fail('agent_permission_unavailable', '此原生接入没有可确认的默认权限目录。', 409);
  return catalog;
}
/** Native human command, never a model prompt or a global/default-settings mutation. */
export async function applyDshPermissions(remote: any, contextId: string, mode: PermissionMode | undefined, snapshot: () => Promise<any>): Promise<void> {
  const permissionMode = resolvePermissionMode(mode);
  try {
    const catalog = await dshPermissionCatalog(remote);
    const selected = permissionMode === 'full-access' ? 'danger-full-access' : catalog.defaultPreset;
    if (!catalog.options.some(option => option.value === selected) || selected.length > 160 || /[\r\n\x00]/.test(selected)) fail('agent_permission_unavailable', '此原生接入未提供所选权限预设。', 409);
    const commands = dshValue(await bounded(remote.commands.list(contextId), 5_000));
    if (!commands.some((command: any) => command.name === 'permission' && command.definitionId === '@deepseek-ai/dsh-permission-presets')) fail('agent_permission_unavailable', '当前原生会话没有可验证的权限切换命令。', 409);
    const execution = dshValue(await bounded(remote.commands.execute(contextId, `/permission ${selected}`, []), 5_000));
    if (execution?.result?.kind !== 'success') fail('agent_permission_unavailable', '原生权限切换未完成，本次工作指令尚未交付。', 409);
    const observed = await snapshot();
    if (observed.projections?.values?.permissions?.currentValue !== selected) fail('agent_permission_unverified', '尚未观察到所选原生权限，本次工作指令尚未交付。', 409);
  } catch (error) {
    if (error instanceof AgentServiceError) throw error;
    fail('agent_permission_unverified', '无法确认原生权限，本次工作指令尚未交付。', 409);
  }
}
