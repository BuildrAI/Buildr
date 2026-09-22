import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Tooltip } from 'antd';
import { ArrowRightOutlined, CheckCircleOutlined, ClockCircleOutlined, PushpinFilled, PushpinOutlined } from '@ant-design/icons';
import type { WorkbenchTaskItem } from '../../../../build/generated/workbench-dto';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { formatDateTime, taskStatusLabel } from '../../../lib/taskLabels';
import { useWorkbenchPreferences } from '../hooks/useWorkbenchPreferences';

export const attentionLabels = { decision: '等你决定', acceptance: '等你验收', question: '需要你介入' };

export function WorkbenchTaskRow({ item, projectNames, compact = false, onError }: {
  item: WorkbenchTaskItem; projectNames: Record<string, string>; compact?: boolean; onError(message: string): void;
}) {
  const { workspaceId } = useAppShell(), location = useLocation();
  const { has, set, remove } = useWorkbenchPreferences(workspaceId);
  const [saving, setSaving] = useState(false);
  const record = item.task.record, context = item.workContext.context;
  const pinned = has('pinned-task', record.taskId);
  const href = workspaceHref(workspaceId, '/tasks/' + encodeURIComponent(record.taskId));
  const summary = context?.progress || record.result?.summary || record.intent;
  const attention = context?.attention?.state === 'pending' ? context.attention : null;
  const pin = async () => {
    setSaving(true);
    try { if (pinned) await remove('pinned-task', record.taskId); else await set('pinned-task', record.taskId); }
    catch (err) { onError(err instanceof Error ? err.message : '置顶未能保存'); }
    finally { setSaving(false); }
  };
  return <article className="workbench-task-row" data-workbench-task={record.taskId}>
    <span className={'workbench-task-status-symbol ' + record.status} title={taskStatusLabel(record.status)}>{record.status === 'completed' ? <CheckCircleOutlined /> : <ClockCircleOutlined />}</span>
    <div className="workbench-task-copy">
      <Link className="workbench-task-title" to={href} state={{ from: location.pathname + location.search }}>{record.title}</Link>
      <p className="workbench-task-summary">{summary}</p>
      <div className="workbench-task-meta">
        {record.scope.projects.length ? <span>{record.scope.projects.map(code => projectNames[code] || code).join('、')}</span> : <span>工作空间范围</span>}
        <time>{formatDateTime(context?.updatedAt || record.updatedAt)}</time>
        {attention ? <span className={'workbench-attention-label ' + attention.kind}>{attentionLabels[attention.kind]}</span> : null}
        {item.task.taskRelations.children.length ? <span>含 {item.task.taskRelations.children.length} 项子任务</span> : null}
      </div>
    </div>
    <div className="workbench-task-row-actions">
      {!compact ? <span className={'lifecycle-badge ' + record.status}>{taskStatusLabel(record.status)}</span> : null}
      <Tooltip title={pinned ? '取消置顶' : '置顶'}>
        <Button size="small" type="text" loading={saving} icon={pinned ? <PushpinFilled /> : <PushpinOutlined />} onClick={() => void pin()} aria-label={(pinned ? '取消置顶：' : '置顶：') + record.title} />
      </Tooltip>
      <Link to={href} state={{ from: location.pathname + location.search }} aria-label={'打开任务：' + record.title}><ArrowRightOutlined /></Link>
    </div>
  </article>;
}
