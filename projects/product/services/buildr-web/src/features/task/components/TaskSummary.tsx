import { Alert, Button } from 'antd';
import { Link } from 'react-router-dom';
import type { TaskDetailResponse } from '../../../../build/generated/task-dto';
import type { TaskWorkContextResponse } from '../../../../build/generated/workbench-dto';
import { formatDateTime, taskStatusLabel } from '../../../lib/taskLabels';
import { type TaskNodeStage } from './taskWorkContent';

export function TaskSummary({ task, context: response, error, onOpen, onRespond, href }: {
  task:TaskDetailResponse; context:TaskWorkContextResponse|null; error:string|null;
  onOpen(node:TaskNodeStage, content?:string):void; onRespond():void; href(path:string):string;
}) {
  const record=task.record, context=response?.context, attention=context?.attention;
  const updated=[record.updatedAt,context?.updatedAt].filter((value):value is string=>Boolean(value)).sort().at(-1)!;
  return <section id="task-work-context" className="task-header-context" aria-label="任务信息">
    <div className="task-metadata-line">
      <span className="task-scope-links">项目：{record.scope.projects.length ? record.scope.projects.map((project,index)=><span key={project}>{index ? '、' : ''}<Link to={href(`/projects/${encodeURIComponent(project)}`)}>{project}</Link></span>) : '工作空间'}</span>
      {record.scope.services.length > 0 && <span className="task-scope-links">服务：{record.scope.services.map((item, index) => <span key={`${item.project}/${item.service}`}>{index ? '、' : ''}<Link to={href(`/services/${encodeURIComponent(item.project)}/${encodeURIComponent(item.service)}`)}>{item.service}</Link></span>)}</span>}
      <time title={formatDateTime(updated)}>最后更新 {formatDateTime(updated).replace(/:\d{2}$/,'')}</time>
      {task.taskRelations.parent && <span id="task-detail-parent"><Link to={href(`/tasks/${encodeURIComponent(task.taskRelations.parent.taskId)}?taskType=composite`)}>所属组合：{task.taskRelations.parent.title}</Link> · {taskStatusLabel(task.taskRelations.parent.status)}</span>}
      {!record.isParent && task.taskRelations.children.length>0 && <Button type="link" size="small" onClick={()=>onOpen('closeout','coordination')}>{task.taskRelations.children.length} 项子任务</Button>}
    </div>
    {error && <Alert type="warning" message={error} />}
    {attention?.state==='pending' && <div id="task-attention" className="task-summary-attention"><div><strong>{attention.kind==='acceptance'?'等待你确认成果':attention.kind==='question'?'需要你的答复':'等待你的决定'}</strong><p id="task-attention-reason">{attention.reason}</p></div><Button id="task-attention-respond" type="primary" size="small" onClick={attention.kind==='acceptance'?()=>onOpen('closeout','acceptance'):onRespond}>{attention.kind==='acceptance'?'查看并确认':'记录答复'}</Button></div>}
    {attention?.response && attention.kind!=='acceptance' && <div className="task-summary-response"><strong>你的意见</strong><p id="task-attention-response">{attention.response.text}</p></div>}
  </section>;
}
