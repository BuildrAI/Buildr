/** The native editor remains the only writer; this adapter addresses our one declared field. */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { desktopFault } from './plugin-error.ts';
import type { MaintainerBinding, BindingMaintenanceView, BindingMaintenanceUpdate } from './src/types.ts';

type Entry = { options: { id: string; name: string; config?: unknown } };
export interface NativeBindingEditor {
  entries(): Entry[];
  edit(entry: Entry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>): Promise<void>;
}
const keys = ['nodeExecutable', 'cliEntry', 'nodeSha256', 'cliSha256'];
function binding(value: unknown): MaintainerBinding | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw desktopFault('binding_invalid', 'Buildr 入口绑定无效。');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key))) throw desktopFault('binding_invalid', 'Buildr 入口绑定含未声明字段。');
  for (const key of ['nodeExecutable', 'cliEntry']) if (typeof row[key] !== 'string' || !path.isAbsolute(row[key])
    || row[key].length > 4096 || /[\u0000-\u001f\u007f]/.test(row[key])) throw desktopFault('binding_invalid', '需要已核验入口的绝对路径。');
  for (const key of ['nodeSha256', 'cliSha256']) if (row[key] !== undefined
    && (typeof row[key] !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(row[key]))) throw desktopFault('binding_invalid', '入口文件摘要无效。');
  return { nodeExecutable: row.nodeExecutable as string, cliEntry: row.cliEntry as string,
    ...(typeof row.nodeSha256 === 'string' ? { nodeSha256: row.nodeSha256 } : {}),
    ...(typeof row.cliSha256 === 'string' ? { cliSha256: row.cliSha256 } : {}) };
}
const revision = (value: MaintainerBinding | null) => 'sha256-' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createBindingMaintenance(editor: NativeBindingEditor, entryId: string, moduleName: string) {
  const ownEntry = () => {
    const entries = editor.entries().filter(entry => entry.options.id === entryId && entry.options.name === moduleName);
    if (entries.length !== 1) throw desktopFault('binding_unavailable', '当前插件的原生配置入口不可唯一确认。');
    return entries[0];
  };
  const read = (): BindingMaintenanceView => {
    const config = ownEntry().options.config;
    const current = binding(config && typeof config === 'object' ? Reflect.get(config, 'binding') : undefined);
    return { revision: revision(current), binding: current };
  };
  return {
    read,
    async update(request: BindingMaintenanceUpdate): Promise<BindingMaintenanceView> {
      if (!request || Object.keys(request).some(key => !['binding', 'expectedRevision'].includes(key))
        || !Object.hasOwn(request, 'binding') || typeof request.expectedRevision !== 'string') throw desktopFault('binding_invalid', '入口维护请求无效。');
      const nextBinding = binding(request.binding), entry = ownEntry();
      await editor.edit(entry, current => {
        if (revision(binding(current.binding)) !== request.expectedRevision) throw desktopFault('binding_conflict', '入口绑定已变化，请重新读取后决定。');
        const next = { ...current };
        if (nextBinding === null) delete next.binding; else next.binding = nextBinding;
        return next;
      });
      return read();
    },
  };
}
