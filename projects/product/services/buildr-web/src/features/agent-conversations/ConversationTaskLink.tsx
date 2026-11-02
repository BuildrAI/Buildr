import { useEffect, useState } from 'react';
import { Alert, Button, Popover } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { taskApi } from '../task/api/task-api';
import type { StoredTaskView } from '../../../build/generated/task-dto';

type Props = {workspaceId: string; taskId?: string; taskIds?: string[]; onAssign(ids: string[]): Promise<boolean>};
/** Links remain independent from association editing; selecting a row toggles only that relation. */
export function ConversationTaskLink({workspaceId, taskId, taskIds, onAssign}: Props) {
  const ids = taskIds ?? (taskId ? [taskId] : []);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StoredTaskView[]>([]);
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string>(), [nextCursor, setNextCursor] = useState<string>();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    void taskApi.list({status:'all',cursor,pageSize: '50'}, {signal: controller.signal}, workspaceId)
      .then(result => { if (!controller.signal.aborted) { setRows(previous => !cursor ? result.tasks : [...previous, ...result.tasks.filter(row => !previous.some(item => item.record.taskId === row.record.taskId))]); setNextCursor(result.nextCursor ?? undefined); setError(''); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '读取任务列表失败。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, workspaceId, cursor]);
  const choose = async (next: string[]) => {
    setSaving(true);
    try { if (await onAssign(next)) setOpen(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '保存关联失败。'); }
    finally { setSaving(false); }
  };
  const picker = <div className="ac-task-picker ac-task-associate">
    {error && <Alert type="warning" message={error}/>}
    {loading && <small>正在读取任务…</small>}
    {!loading && !rows.length && !error && <small>此工作空间暂无任务。</small>}
    {rows.map(({record}) => {
      const selected = ids.includes(record.taskId);
      return <button key={record.taskId} type="button" disabled={saving || loading} className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => void choose(selected ? ids.filter(id => id !== record.taskId) : taskIds ? [...ids, record.taskId] : [record.taskId])}>
        <strong>{selected ? '✓ ' : ''}{record.title}</strong><small>{record.taskId}</small>
      </button>;
    })}
    {nextCursor && <Button size="small" disabled={loading || saving} onClick={() => setCursor(nextCursor)}>加载更多任务</Button>}
    {ids.map(id => <Button key={id} size="small" disabled={saving} onClick={() => void choose(ids.filter(value => value !== id))}>解除关联 {id}</Button>)}
  </div>;
  return <Popover rootClassName="ac-panel-popup" trigger="click" open={open} onOpenChange={value => { if (!saving) { setOpen(value); if (value) setCursor(undefined); } }} content={picker} placement="bottomLeft">
    <button type="button" className="ac-task-associate-trigger" aria-label="管理关联任务" title="添加或解除任务关联"><LinkOutlined aria-hidden/>{ids.length ? '管理关联' : '关联任务'}</button>
  </Popover>;
}
