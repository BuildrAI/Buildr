import { useEffect, useRef, useState } from 'react';
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
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const columns: ColumnsType<TaskListItem> = [
    { title: '任务', key: 'task', render: (_value, item, index) => {
      const record = item.record, context = contexts[record.taskId]?.context;
      const result = record.status === 'completed' || record.status === 'abandoned';
      const preview = result ? record.result?.summary : context?.progress;
      const previewLabel = preview ? (result ? '结果：' : '进展：') : '';
      const group = taskProjectGroup(item, projectNames);
      const showGroup = grouped && (index === 0 || group !== taskProjectGroup(tasks[index - 1], projectNames));
      return <>
        {showGroup && <div className="task-project-group">{group}</div>}
        <div className="task-compact-copy">
          <Link className="task-row-main" title={`${record.taskId} · ${group}`} to={taskHref(record.taskId)} onClick={event => { event.stopPropagation(); if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onOpen(record.taskId); }}><strong>{record.title}</strong></Link>
          <p className="task-row-summary">{previewLabel}{summary(preview || record.intent)}</p>
        </div>
      </>;
    } },
    ...(width >= 570 && !grouped ? [{ title: '项目', key: 'project', width: 120, ellipsis: true, render: (_value: unknown, item: TaskListItem) => taskProjectGroup(item, projectNames) }] : []),
    { title: '状态', key: 'status', width: 88, render: (_value, item) => {
      const attention = contexts[item.record.taskId]?.context?.attention;
      return <div className="task-compact-status"><span className={`lifecycle-badge ${item.record.status}`}>{taskStatusLabel(item.record.status)}</span>{attention?.state === 'pending' && <small className="task-attention-label">{attention.kind === 'acceptance' ? '等待验收' : attention.kind === 'question' ? '需要答复' : '等待决定'}</small>}{item.record.retrospective?.state === 'pending-decision' && <small className="task-attention-label">复盘待决定</small>}</div>;
    } },
    ...(width >= 740 ? [{ title: '更新', key: 'updated', width: 138, render: (_value: unknown, item: TaskListItem) => {
      const recorded = item.record.updatedAt, progress = contexts[item.record.taskId]?.context?.updatedAt;
      const time = progress && progress > recorded ? progress : recorded;
      return <time className="task-row-time" title={formatDateTime(time)}>{formatDateTime(time).replace(/:\d{2}$/, '')}</time>;
    } }] : []),
    { title: '', key: 'pin', width: 54, align: 'right', render: (_value, item) => <Tooltip title={isPinned(item.record.taskId) ? '取消置顶' : '置顶这项工作'}><Button type="text" size="small" loading={pending === item.record.taskId} aria-label={`${isPinned(item.record.taskId) ? '取消置顶' : '置顶'}：${item.record.title}`} icon={isPinned(item.record.taskId) ? <PushpinFilled /> : <PushpinOutlined />} onClick={event => { event.stopPropagation(); onPin(item.record.taskId); }} /></Tooltip> },
  ];
  return <div ref={root} className="resource-directory-table task-list-table"><Table className="task-compact-table" rowKey={(item) => item.record.taskId} pagination={false} showHeader tableLayout="fixed" dataSource={tasks} columns={columns} onRow={(item) => ({ onClick: () => onOpen(item.record.taskId), 'data-task-id': item.record.taskId, ...(item.record.taskId === prefetchTaskId ? { 'data-task-prefetch': 'true' } : {}) })} components={{ body: { wrapper: TableBody } }} /></div>;
}
