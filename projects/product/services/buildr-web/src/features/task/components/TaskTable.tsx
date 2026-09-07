import { Link } from 'react-router-dom';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { taskStatusLabel } from '../../../lib/taskLabels';
import type { TaskListItem } from '../hooks/useTaskList';

const TableBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody id="task-table-body" {...props} />;

export function TaskTable({ tasks, selectedTaskId, prefetchTaskId, taskHref, onOpen }: {
  tasks: TaskListItem[];
  selectedTaskId?: string;
  prefetchTaskId?: string;
  taskHref(taskId: string): string;
  onOpen(taskId: string): void;
}) {
  const columns: ColumnsType<TaskListItem> = [
    { title: '任务', ellipsis: true, render: (_value, item) => <Link className="task-row-main" to={taskHref(item.record.taskId)}><strong>{item.record.title}</strong><small className="task-row-id">{item.record.taskId}</small></Link> },
    { title: '状态', width: 88, render: (_value, item) => <span className={`lifecycle-badge ${item.record.status}`}>{taskStatusLabel(item.record.status)}</span> },
  ];
  return <Table rowKey={(item) => item.record.taskId} pagination={false} showHeader={false} tableLayout="fixed" dataSource={tasks} columns={columns} rowClassName={(item) => item.record.taskId === selectedTaskId ? 'task-row-active' : ''} onRow={(item) => ({ onClick: () => onOpen(item.record.taskId), 'data-task-id': item.record.taskId, ...(item.record.taskId === prefetchTaskId ? { 'data-task-prefetch': 'true' } : {}) })} components={{ body: { wrapper: TableBody } }} />;
}
