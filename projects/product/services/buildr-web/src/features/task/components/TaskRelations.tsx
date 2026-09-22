import { Link, useLocation } from 'react-router-dom';
import { taskStatusLabel } from '../../../lib/taskLabels';
import type { TaskDetailData } from './shared';

export function TaskRelations({ data, taskHref }: { data: TaskDetailData; taskHref(taskId: string): string }) {
  const { state } = useLocation();
  return <>
    <div><dt>整体目标</dt><dd id="task-detail-parent">{data.taskRelations.parent ? <Link state={state} to={taskHref(data.taskRelations.parent.taskId)}>{`${data.taskRelations.parent.title} · ${data.taskRelations.parent.taskId} · ${taskStatusLabel(data.taskRelations.parent.status)}`}</Link> : '无（独立 Task）'}</dd></div>
    <div><dt>直接子任务</dt><dd id="task-detail-children">{!data.taskRelations.children.length ? '无' : <span className="task-change-links">{data.taskRelations.children.map((child) => <Link key={child.taskId} className={`task-change-link ${child.status}`} to={taskHref(child.taskId)}>{`${child.title} · ${child.taskId} · ${taskStatusLabel(child.status)}`}</Link>)}</span>}</dd></div>
  </>;
}
