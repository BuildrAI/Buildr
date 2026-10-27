import { useEffect, useState } from 'react';
import { Alert, Button, Popover } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { taskApi } from '../task/api/task-api';
import type { StoredTaskView } from '../../../build/generated/task-dto';

const statusLabels: Record<string,string> = { todo: '待办', active: '进行中' };

/** 对话侧的任务关联入口：列出同一工作空间未结束的任务，供建立、更换或解除引用。 */
export function ConversationTaskLink({workspaceId, taskId, onAssign}:{workspaceId: string; taskId?: string; onAssign(taskId: string | undefined): void}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StoredTaskView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    void taskApi.list({status: 'open', pageSize: '50'}, {signal: controller.signal}, workspaceId)
      .then(result => { if (!controller.signal.aborted) { setRows(result.tasks); setError(''); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '读取任务列表失败。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, workspaceId]);
  const choose = (next: string | undefined) => { setOpen(false); onAssign(next); };
  const picker = <div className="ac-task-picker ac-task-associate">
    {error && <Alert type="warning" message={error}/>}
    {loading && !rows ? <small>正在读取任务…</small> : null}
    {!loading && rows && !rows.length && !error ? <small>此工作空间还没有进行中的任务。</small> : null}
    {(rows ?? []).map(row => {
      const record = row.record, selected = record.taskId === taskId;
      return <button key={record.taskId} type="button" className={selected ? 'is-selected' : ''} aria-current={selected || undefined} onClick={() => choose(record.taskId)}>
        <strong>{record.title}</strong>
        <small>{record.taskId}{statusLabels[record.status] ? ' · ' + statusLabels[record.status] : ''}</small>
      </button>;
    })}
    {taskId ? <Button size="small" onClick={() => choose(undefined)}>解除关联</Button> : null}
  </div>;
  return <Popover rootClassName="ac-panel-popup" trigger="click" open={open} onOpenChange={setOpen} content={picker} placement="bottomLeft">
    <button type="button" className="ac-task-associate-trigger" aria-label={taskId ? '更换或解除任务关联' : '关联任务'} title={taskId ? '更换或解除任务关联' : '关联任务'}><LinkOutlined aria-hidden/>{taskId ? '更换' : '关联任务'}</button>
  </Popover>;
}
