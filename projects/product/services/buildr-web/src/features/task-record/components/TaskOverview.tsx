import { MarkdownHost } from '../../../components/MarkdownHost';
import { taskStatusLabel } from '../../../lib/taskLabels';
import type { TaskRecord } from '../api/generated/task-record-dto';

export function TaskOverview({ record, onRelativeLink }: { record: TaskRecord; onRelativeLink(href: string): void }) {
  return <section className="detail-page-header"><div className="detail-title-row"><div className="detail-title-copy">
    <h1 id="task-detail-title">{record.title}</h1><p id="task-detail-id" className="task-detail-id">{record.taskId}</p>
    <div id="task-detail-intent" className="page-copy task-intent-markdown"><MarkdownHost markdown={record.intent} options={{ allowRelativeLinks: true, onRelativeLinkClick: onRelativeLink }} /></div>
  </div><span id="task-detail-status" className={`lifecycle-badge ${record.status}`}>{taskStatusLabel(record.status)}</span></div></section>;
}
