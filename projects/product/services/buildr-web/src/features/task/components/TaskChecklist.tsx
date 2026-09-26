import type { ReactNode, HTMLAttributes } from 'react';
import { Alert } from 'antd';
import { SideReadingPanel } from '../../../components/SideReadingPanel';
import type { TaskBriefState } from '../hooks/useTaskArtifacts';
import type { TaskDocumentItem, TaskReadTarget } from './taskWorkContent';

export function TaskChecklist({ open, pinned, canPin, onTogglePin, onClose, briefs, documents, renderContent, ...events }: HTMLAttributes<HTMLElement> & {pinned:boolean; canPin:boolean; onTogglePin():void; open:boolean; onClose():void; briefs:TaskBriefState[]; documents:TaskDocumentItem[]; renderContent(target:TaskReadTarget):ReactNode}) {
  const items = documents.filter(item => item.stage === 'implementation');
  return <SideReadingPanel {...events} id="task-checklist" title="实施清单" className="task-checklist" open={open} pinned={pinned} canPin={canPin} onTogglePin={onTogglePin} onClose={onClose}>
    {briefs.some(item => item.kind === 'missing') && <Alert type="warning" message="部分实施清单暂不可读取。" />}
    {items.length ? items.map(item => <section key={item.key}>{items.length > 1 && <h3>{item.changeKey}</h3>}{renderContent({kind:'artifact',title:'实施清单',path:item.artifact.path,changeKey:item.changeKey})}</section>) : <p className="task-node-empty">{briefs.length ? '暂无实施清单。' : '正在读取…'}</p>}
  </SideReadingPanel>;
}
