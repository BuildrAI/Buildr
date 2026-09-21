import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Radio, Select, Space, Typography } from 'antd';
import type { TaskEndRequest } from '../../../../build/generated/task-dto';
import type { CoordinationResponse } from '../../../../build/generated/task-professional-http-dto';
import { DrawerShell } from '../../../components/DrawerShell';
import { taskStatusLabel } from '../../../lib/taskLabels';
import { taskProfessionalApi } from '../api/task-professional-api';
import { taskApi } from '../api/task-api';

type Action = TaskEndRequest['children'][number]['action'];
export function CompositeTaskEndDrawer({ taskId, open, onClose, onSaved }: { taskId: string; open: boolean; onClose(): void; onSaved(): Promise<void> }) {
  const [snapshot, setSnapshot] = useState<CoordinationResponse | null>(null);
  const [choices, setChoices] = useState<Record<string, Action>>({});
  const [status, setStatus] = useState<'completed' | 'abandoned'>('completed');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const reread = async () => {
    const request = ++generation.current; setLoading(true);
    try {
      const data = await taskProfessionalApi.coordination(taskId);
      if (generation.current !== request) return;
      setSnapshot(data); setConflict(false); setError('');
      setChoices(previous => Object.fromEntries(data.children.filter(child => ['todo', 'active'].includes(child.status)).map(child => [child.taskId, child.isParent ? 'detach' : previous[child.taskId] || 'detach'])));
    } catch (cause) { if (generation.current === request) setError(cause instanceof Error ? cause.message : '读取失败'); }
    finally { if (generation.current === request) setLoading(false); }
  };
  useEffect(() => {
    if (open) { setSnapshot(null); setChoices({}); setStatus('completed'); setSummary(''); setError(''); setConflict(false); void reread(); }
    return () => { generation.current++; };
  }, [open, taskId]);
  const submit = async () => {
    if (!snapshot?.completion?.snapshotIdentity || !snapshot.recordDigest) return;
    setSaving(true); setError('');
    try {
      await taskApi.end(taskId, { expectedRecordDigest: snapshot.recordDigest, expectedSnapshot: snapshot.completion.snapshotIdentity, status, summary,
        children: snapshot.children.filter(child => ['todo', 'active'].includes(child.status)).map(child => ({ taskId: child.taskId, action: choices[child.taskId] || 'detach' })) });
      onClose(); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '提交失败'); setConflict(true); }
    finally { setSaving(false); }
  };
  const children = snapshot?.children.filter(child => ['todo', 'active'].includes(child.status)) || [];
  return <DrawerShell title="结束组合任务" open={open} onClose={onClose} closeDisabled={saving} maskClosable={!saving} keyboard={!saving} width={680} footer={<Space><Button disabled={saving} onClick={onClose}>取消</Button>{conflict ? <Button loading={loading} onClick={() => void reread()}>重新读取</Button> : <Button type="primary" loading={saving} disabled={loading || !snapshot?.completion?.snapshotIdentity} onClick={() => void submit()}>确认并提交</Button>}</Space>}>
    {error && <Alert type="warning" showIcon message={error} description="已保留当前选择和说明，请核对最新任务后重试。" />}
    <Typography.Title level={5}>未结束子任务 {children.length}</Typography.Title>
    <Typography.Paragraph type="secondary">独立推进：解除所属关系，保留任务当前状态。</Typography.Paragraph>
    {children.map(child => <div className="composite-end-row" key={child.taskId}><span>{child.title}{child.isParent && <small>（组合任务）</small>}</span><span className={`lifecycle-badge ${child.status}`}>{taskStatusLabel(child.status)}</span><Select aria-label={`${child.title}处理方式`} value={choices[child.taskId] || 'detach'} disabled={saving} onChange={value => setChoices(old => ({ ...old, [child.taskId]: value }))} options={[{ value: 'detach', label: '独立推进' }, ...(!child.isParent ? [{ value: 'abandon', label: '放弃' }, { value: 'complete', label: '已完成' }] : [])]} /></div>)}
    {!loading && !children.length && <Typography.Paragraph type="secondary">没有未结束的子任务。</Typography.Paragraph>}
    <Typography.Title level={5}>组合任务结果</Typography.Title>
    <Radio.Group value={status} disabled={saving} onChange={event => setStatus(event.target.value)} options={[{ label: '已完成', value: 'completed' }, { label: '放弃', value: 'abandoned' }]} />
    <label className="composite-end-note">备注说明 <span>选填</span><Input.TextArea aria-label="备注说明" rows={4} maxLength={20000} value={summary} disabled={saving} onChange={event => setSummary(event.target.value)} placeholder="需要时补充整体结果或说明" /></label>
  </DrawerShell>;
}
