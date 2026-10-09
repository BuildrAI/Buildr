import type { ReactNode, HTMLAttributes } from 'react';
import { Alert } from 'antd';
import { SideReadingPanel } from '../../../components/SideReadingPanel';
import type { TaskChangeState } from '../hooks/useTaskArtifacts';
import type { TaskMaterialsState } from '../task-materials';
import { taskDocumentTarget, type TaskDocumentItem, type TaskReadTarget } from './taskWorkContent';

export function TaskChecklist({ open, pinned, canPin, onTogglePin, onClose, changes, changesLoading = false, materials, documents, renderContent, ...events }: HTMLAttributes<HTMLElement> & {pinned:boolean; canPin:boolean; onTogglePin():void; open:boolean; onClose():void; changes:TaskChangeState[]; changesLoading?:boolean; materials:TaskMaterialsState; documents:TaskDocumentItem[]; renderContent(target:TaskReadTarget):ReactNode}) {
  const items = documents.filter(item => item.stage === 'implementation');
  const missingChanges = changes.some(item => item.kind === 'missing');
  const diagnostics = materials.data?.diagnostics || [];
  const pending = materials.loading || (!materials.data && !materials.error) || changesLoading;
  const readingMaterial = items.some(item => item.material);
  return <SideReadingPanel {...events} id="task-checklist" title="实施清单" className="task-checklist" open={open} pinned={pinned} canPin={canPin} onTogglePin={onTogglePin} onClose={onClose}>
    {missingChanges && <Alert type="warning" message="部分实施清单暂不可读取。" />}
    {!readingMaterial && pending && <Alert type="info" message={items.length ? '材料关联正在核对，当前显示上次读取的内容。' : '正在读取实施清单…'} />}
    {!readingMaterial && materials.error && <Alert type="warning" message={`任务材料读取失败：${materials.error}`} description="尚未确认当前材料关联，请刷新任务后重试。" />}
    {diagnostics.map((item, index) => <Alert key={`${item.code}:${index}`} type="warning" message={item.message} />)}
    {items.length ? items.map(item => <section key={item.key}>{items.length > 1 && <h3>{item.changeKey}</h3>}{renderContent(taskDocumentTarget(item))}</section>) : !pending && !materials.error && !diagnostics.length && !missingChanges && <p className="task-node-empty">暂无实施清单。</p>}
  </SideReadingPanel>;
}
