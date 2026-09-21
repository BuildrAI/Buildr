import { useEffect, useState, type ReactNode } from 'react';
import { Button } from 'antd';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { taskStatusLabel } from '../../../lib/taskLabels';
import type { TaskRecord } from '../../../../build/generated/task-dto';

export function TaskOverview({ record, onRelativeLink, onReadIntent, actions }: { actions?: ReactNode; record: TaskRecord; onRelativeLink(href: string): void; onReadIntent?(): void }) {
  const [expanded, setExpanded] = useState(false);
  const longIntent = record.intent.length > 160 || record.intent.split('\n').length > 8;
  useEffect(() => setExpanded(false), [record.taskId]);
  return <section className="detail-page-header"><div className="detail-title-row"><div className="detail-title-copy">
    <div className="task-title-heading"><h1 id="task-detail-title">{record.title}</h1><span id="task-detail-status" className={`lifecycle-badge ${record.status}`}>{taskStatusLabel(record.status)}</span></div><p id="task-detail-id" className="task-detail-id">{record.taskId}</p>
    <div id="task-detail-intent" className={`page-copy task-intent-markdown${longIntent && !expanded ? ' task-intent-collapsed' : ''}`} onFocusCapture={() => setExpanded(true)}><MarkdownHost markdown={record.intent} options={{ allowRelativeLinks: true, onRelativeLinkClick: onRelativeLink }} /></div>
    {longIntent && <Button id="task-intent-toggle" type="link" size="small" aria-expanded={expanded} onClick={() => onReadIntent ? onReadIntent() : setExpanded(value => !value)}>{onReadIntent ? '阅读完整目标' : expanded ? '收起目标' : '展开完整目标'}</Button>}
  </div><div className="task-header-actions">{actions}</div></div></section>;
}
