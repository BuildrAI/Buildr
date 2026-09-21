import type { ReactNode } from 'react';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { taskStatusLabel } from '../../../lib/taskLabels';
import type { TaskRecord } from '../../../../build/generated/task-dto';

export function TaskOverview({ record, onRelativeLink, actions }: { actions?: ReactNode; record: TaskRecord; onRelativeLink(href: string): void; }) {
  return <section className="detail-page-header"><div className="detail-title-row"><div className="detail-title-copy">
    <div className="task-title-heading"><h1 id="task-detail-title">{record.title}</h1>{record.isParent && <span className="task-type-badge">组合任务</span>}<span id="task-detail-status" className={`lifecycle-badge ${record.status}`}>{taskStatusLabel(record.status)}</span></div><p id="task-detail-id" className="task-detail-id">{record.taskId}</p>
  </div><div className="task-header-actions">{actions}</div></div>
    <div id="task-detail-intent" className="page-copy task-intent-markdown"><MarkdownHost markdown={record.intent} options={{ allowRelativeLinks: true, onRelativeLinkClick: onRelativeLink }} /></div>
  </section>;
}
