import type { ReactNode } from 'react';
import { Alert } from 'antd';
import type { TaskBriefState } from '../hooks/useTaskArtifacts';
import type { TaskDocumentItem, TaskReadTarget } from './taskWorkContent';

export function TaskChecklist({ briefs, documents, renderContent }: {briefs:TaskBriefState[]; documents:TaskDocumentItem[]; renderContent(target:TaskReadTarget):ReactNode}) {
  const items = documents.filter(item => item.stage === 'implementation');
  return <aside className="task-checklist" aria-label="实施清单"><h2>实施清单</h2>
    {briefs.some(item => item.kind === 'missing') && <Alert type="warning" message="部分实施清单暂不可读取。" />}
    {items.length ? items.map(item => <section key={item.key}>{items.length > 1 && <h3>{item.changeKey}</h3>}{renderContent({kind:'artifact',title:'实施清单',path:item.artifact.path,changeKey:item.changeKey})}</section>) : <p className="task-node-empty">{briefs.length ? '暂无实施清单。' : '正在读取…'}</p>}
  </aside>;
}
