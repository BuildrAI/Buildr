import type { ReactNode, HTMLAttributes } from 'react';
import { Alert, Button } from 'antd';
import { CloseOutlined, PushpinOutlined, PushpinFilled } from '@ant-design/icons';
import type { TaskBriefState } from '../hooks/useTaskArtifacts';
import type { TaskDocumentItem, TaskReadTarget } from './taskWorkContent';

export function TaskChecklist({ open, pinned, canPin, onTogglePin, onClose, briefs, documents, renderContent, ...events }: HTMLAttributes<HTMLElement> & {pinned:boolean; canPin:boolean; onTogglePin():void; open:boolean; onClose():void; briefs:TaskBriefState[]; documents:TaskDocumentItem[]; renderContent(target:TaskReadTarget):ReactNode}) {
  const items = documents.filter(item => item.stage === 'implementation');
  return <aside {...events} id="task-checklist-panel" hidden={!open} className={`task-checklist${pinned ? ' is-pinned' : ''}`} role="region" aria-label="实施清单" onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose(); } }}><div className="task-checklist-heading"><h2>实施清单</h2><div className="task-checklist-actions"><Button id="task-checklist-pin" type="text" size="small" disabled={!canPin && !pinned} title={!canPin ? '展开阅读后可固定并排查看' : undefined} icon={pinned ? <PushpinFilled /> : <PushpinOutlined />} aria-pressed={pinned} onClick={onTogglePin}>{pinned ? '取消固定' : '固定'}</Button><Button type="text" size="small" icon={<CloseOutlined />} aria-label="关闭实施清单" onClick={onClose} /></div></div>
    <div className="task-checklist-body">{briefs.some(item => item.kind === 'missing') && <Alert type="warning" message="部分实施清单暂不可读取。" />}
    {items.length ? items.map(item => <section key={item.key}>{items.length > 1 && <h3>{item.changeKey}</h3>}{renderContent({kind:'artifact',title:'实施清单',path:item.artifact.path,changeKey:item.changeKey})}</section>) : <p className="task-node-empty">{briefs.length ? '暂无实施清单。' : '正在读取…'}</p>}
    </div>
  </aside>;
}
