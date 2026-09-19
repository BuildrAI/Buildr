import { Link } from 'react-router-dom';
import { Button, Table, Tooltip } from 'antd';
import { PushpinFilled, PushpinOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { formatDateTime, taskStatusLabel } from '../../../lib/taskLabels';
import type { TaskWorkContextResponse } from '../../../../build/generated/workbench-dto';
import type { TaskListItem } from '../hooks/useTaskList';

const TableBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody id="task-table-body" {...props} />;

function summary(value: string) {
  return value.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#*`>]/g, '').replace(/\s+/g, ' ').trim();
}

export function taskProjectGroup(item: TaskListItem, projectNames: Record<string, string>) {
  const projects = item.record.scope.projects;
  return projects.length > 1 ? '跨项目工作' : projects.length === 1 ? (projectNames[projects[0]] || projects[0]) : '工作空间';
}

export function TaskTable({ tasks, prefetchTaskId, projectNames, contexts, grouped, taskHref, onOpen, isPinned, onPin, pending }: {
  tasks: TaskListItem[];
  prefetchTaskId?: string;
  projectNames: Record<string, string>;
  grouped: boolean;
  contexts: Record<string, TaskWorkContextResponse>;
  taskHref(taskId: string): string;
  onOpen(taskId: string): void;
  isPinned(taskId: string): boolean;
  onPin(taskId: string): void;
  pending?: string;
}) {
  const columns: ColumnsType<TaskListItem> = [
    { title: '任务', render: (_value, item, index) => {
      const record = item.record;
      const context = contexts[record.taskId]?.context;
      const group = taskProjectGroup(item, projectNames);
      const showGroup = grouped && (index === 0 || group !== taskProjectGroup(tasks[index - 1], projectNames));
      return <>
        {showGroup && <div className="task-project-group">{group}</div>}
        <div className="task-rich-row">
          <span className={`task-status-symbol ${record.status}`} aria-label={taskStatusLabel(record.status)} />
          <div className="task-rich-copy">
            <Link className="task-row-main" to={taskHref(record.taskId)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpen(record.taskId); }}><strong>{record.title}</strong></Link>
            <p className="task-row-summary">{summary(context?.progress || record.result?.summary || record.intent) || '尚未记录工作目标'}</p>
            <div className="task-row-meta">
              {record.scope.projects.length ? record.scope.projects.map((project) => <span key={project} className="task-project-label">{projectNames[project] || project}</span>) : <span>工作空间</span>}
              <span>更新于 {formatDateTime(record.updatedAt)}</span>
              {item.taskRelations.children.length > 0 && <span>含 {item.taskRelations.children.length} 项子任务</span>}
              {record.parentTaskId && <span>子任务</span>}
              {context?.attention?.state === 'pending' && <span className="task-attention-label">{context.attention.kind === 'acceptance' ? '等待验收' : context.attention.kind === 'question' ? '需要介入' : '等待决定'}</span>}
              {record.retrospective?.state === 'pending-decision' && <span className="task-attention-label">复盘等待决定</span>}
            </div>
            <small className="task-row-id">{record.taskId}</small>
          </div>
        </div>
      </>;
    } },
    { title: '状态', width: 104, render: (_value, item) => <div className="task-rich-actions"><span className={`lifecycle-badge ${item.record.status}`}>{taskStatusLabel(item.record.status)}</span><Tooltip title={isPinned(item.record.taskId) ? '取消置顶' : '置顶这项工作'}><Button type="text" size="small" loading={pending === item.record.taskId} aria-label={`${isPinned(item.record.taskId) ? '取消置顶' : '置顶'}：${item.record.title}`} icon={isPinned(item.record.taskId) ? <PushpinFilled /> : <PushpinOutlined />} onClick={(event) => { event.stopPropagation(); onPin(item.record.taskId); }} /></Tooltip></div> },
  ];
  return <Table className="task-rich-table" rowKey={(item) => item.record.taskId} pagination={false} showHeader={false} tableLayout="fixed" dataSource={tasks} columns={columns} onRow={(item) => ({ onClick: () => onOpen(item.record.taskId), 'data-task-id': item.record.taskId, ...(item.record.taskId === prefetchTaskId ? { 'data-task-prefetch': 'true' } : {}) })} components={{ body: { wrapper: TableBody } }} />;
}
