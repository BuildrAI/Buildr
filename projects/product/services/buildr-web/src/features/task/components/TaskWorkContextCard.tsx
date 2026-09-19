import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Modal, Spin } from 'antd';
import type { TaskWorkContextResponse } from '../../../../build/generated/workbench-dto';
import { workbenchApi } from '../../workbench/api/workbench-api';
import { formatDateTime } from '../../../lib/taskLabels';

const attentionLabel = { decision: '等待你的决定', acceptance: '等待你验收', question: '需要你介入' };
type Props = { taskId: string; data: TaskWorkContextResponse | null; loading: boolean; error: string | null; refresh(): Promise<TaskWorkContextResponse | null> };

export function TaskWorkContextCard({ taskId, data, loading, error, refresh }: Props) {
  const taskRef = useRef(taskId);
  taskRef.current = taskId;
  const [mode, setMode] = useState<'edit' | 'respond' | null>(null);
  const [snapshot, setSnapshot] = useState<TaskWorkContextResponse | null>(null);
  const [progress, setProgress] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [response, setResponse] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => { setMode(null); setSnapshot(null); setMessage(null); setResponse(''); setConflict(false); setSaving(false); }, [taskId]);
  const context = data?.context;
  const attention = context?.attention;
  const open = (next: 'edit' | 'respond') => {
    if (!data) return;
    setSnapshot(data); setProgress(context?.progress || ''); setNextStep(context?.nextStep || ''); setResponse(''); setMessage(null); setConflict(false); setMode(next);
  };
  const save = async () => {
    if (!snapshot) return;
    setSaving(true); setMessage(null);
    try {
      if (mode === 'respond') {
        const currentAttention = snapshot.context?.attention;
        if (!response.trim() || !currentAttention || !snapshot.contextDigest) { setMessage('请填写你的意见。'); return; }
        await workbenchApi.respond(taskId, { expectedContextDigest: snapshot.contextDigest, attentionId: currentAttention.id, response: response.trim() });
      } else {
        await workbenchApi.recordContext(taskId, { expectedContextDigest: snapshot.contextDigest || 'absent', progress: progress.trim(), nextStep: nextStep.trim() });
      }
      if (taskRef.current !== taskId) return;
      setMode(null); await refresh();
    } catch (cause) {
      if (taskRef.current !== taskId) return;
      const value = cause as Error & { status?: number; code?: string };
      const isConflict = value.status === 409 || Boolean(value.code?.includes('conflict')) || Boolean(value.code?.includes('resolved'));
      setConflict(isConflict);
      setMessage(isConflict ? '当前事项或工作摘要已经变化。你的输入已保留，请重新读取后核对，再决定是否保存。' : value.message || '保存失败，请重试。');
    } finally { if (taskRef.current === taskId) setSaving(false); }
  };
  const reread = async () => {
    const next = await refresh();
    if (next && taskRef.current === taskId) { setSnapshot(next); setConflict(false); setMessage('已读取当前内容；请核对下方事项和你的输入，再保存。'); }
  };
  const responseAvailable = snapshot?.context?.attention?.state === 'pending';
  return <section id="task-work-context" className="task-work-context">
    {error && <Alert type="warning" message={error} action={<Button size="small" onClick={() => void refresh()}>重新读取</Button>} />}
    {loading && !data ? <Spin size="small" /> : null}
    {attention && <section id="task-attention" className={`task-attention-card ${attention.state}`}>
      <span className="task-attention-label">{attention.state === 'resolved' ? '已记录你的意见' : attentionLabel[attention.kind]}</span>
      <h2 id="task-attention-reason">{attention.reason}</h2>
      {attention.response ? <><p id="task-attention-response">{attention.response.text}</p><small>{formatDateTime(attention.response.recordedAt)}</small></> : <Button id="task-attention-respond" type="primary" onClick={() => open('respond')}>{attention.kind === 'acceptance' ? '记录验收意见' : attention.kind === 'question' ? '回复这个问题' : '记录我的决定'}</Button>}
    </section>}
    <div className="task-context-heading"><h2>当前进展与下一步</h2><div><Button type="text" size="small" loading={loading} onClick={() => void refresh()}>刷新摘要</Button><Button id="task-context-edit" size="small" disabled={!data} onClick={() => open('edit')}>更新摘要</Button></div></div>
    <div className="task-context-grid"><div><h3>最近进展</h3><p id="task-context-progress">{context?.progress || '尚未记录最近进展'}</p></div><div><h3>下一步</h3><p id="task-context-next-step">{context?.nextStep || '尚未记录下一步'}</p></div></div>
    <p className="task-context-source">{context ? `摘要更新于 ${formatDateTime(context.updatedAt)}` : '当前还没有工作摘要'} · 进展来自最近一次记录。</p>
    <Modal title={mode === 'respond' ? '记录你的意见' : '更新工作摘要'} open={mode !== null} onCancel={() => setMode(null)} footer={<><Button onClick={() => setMode(null)}>取消</Button><Button id="task-context-save" type="primary" loading={saving} disabled={conflict || (mode === 'respond' && !responseAvailable)} onClick={() => void save()}>保存</Button></>} destroyOnClose>
      {message && <Alert id="task-context-message" type={conflict ? 'warning' : 'info'} showIcon message={message} action={conflict ? <Button id="task-context-reread" onClick={() => void reread()}>重新读取</Button> : undefined} />}
      {mode === 'respond' ? <><p className="task-context-modal-reason">{snapshot?.context?.attention?.reason || '这条事项已经不存在'}</p>{!responseAvailable && <Alert type="info" message="当前事项已经处理或撤回，请关闭后查看最新内容。" />}<label className="task-context-field">你的意见与下一步<Input.TextArea id="task-attention-response-input" rows={5} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="写下确认的方向或需要调整的地方…" /></label><p className="task-context-source">保存后保留你的意见，事项移出待处理；任务状态保持不变。</p></> : <><label className="task-context-field">最近进展<Input.TextArea id="task-context-progress-input" rows={4} value={progress} onChange={(event) => setProgress(event.target.value)} /></label><label className="task-context-field">下一步<Input.TextArea id="task-context-next-input" rows={3} value={nextStep} onChange={(event) => setNextStep(event.target.value)} /></label><p className="task-context-source">只更新工作摘要，已有事项和答复继续保留。</p></>}
    </Modal>
  </section>;
}
