import { Button } from 'antd';
import { Link } from 'react-router-dom';
import type { TaskDetailResponse } from '../../../../build/generated/task-dto';
import type { TaskWorkContextResponse } from '../../../../build/generated/workbench-dto';
import { formatDateTime, taskStatusLabel } from '../../../lib/taskLabels';
import type { TaskNodeStage } from './taskWorkContent';

export function TaskHeaderMetadata({ task, context, href, onOpen }: {
  task: TaskDetailResponse; context: TaskWorkContextResponse | null; href(path: string): string;
  onOpen(node: TaskNodeStage, content?: string): void;
}) {
  const record = task.record;
  const updated = [record.updatedAt, context?.context?.updatedAt].filter((value): value is string => Boolean(value)).sort().at(-1)!;
  return <div id="task-work-context" className="task-metadata-line task-header-metadata" aria-label="任务信息">
    <span id="task-detail-id" className="task-detail-id">{record.taskId}</span>
    <span className="task-scope-links">项目：{record.scope.projects.length ? record.scope.projects.map((project,index)=><span key={project}>{index ? '、' : ''}<Link to={href(`/projects/${encodeURIComponent(project)}`)}>{project}</Link></span>) : '工作空间'}</span>
    {record.scope.services.length > 0 && <span className="task-scope-links">服务：{record.scope.services.map((item,index)=><span key={`${item.project}/${item.service}`}>{index ? '、' : ''}<Link to={href(`/services/${encodeURIComponent(item.project)}/${encodeURIComponent(item.service)}`)}>{item.service}</Link></span>)}</span>}
    <time title={formatDateTime(updated)}>最后更新 {formatDateTime(updated).replace(/:\d{2}$/,'')}</time>
    {task.taskRelations.parent && <span id="task-detail-parent"><Link to={href(`/tasks/${encodeURIComponent(task.taskRelations.parent.taskId)}?taskType=composite`)}>所属组合：{task.taskRelations.parent.title}</Link> · {taskStatusLabel(task.taskRelations.parent.status)}</span>}
    {!record.isParent && task.taskRelations.children.length > 0 && <Button type="link" size="small" onClick={()=>onOpen('closeout','coordination')}>{task.taskRelations.children.length} 项子任务</Button>}
  </div>;
}
