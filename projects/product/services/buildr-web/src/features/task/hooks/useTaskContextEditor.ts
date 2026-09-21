import { useEffect, useRef, useState } from 'react';
import type { TaskWorkContextResponse } from '../../../../build/generated/workbench-dto';
import { workbenchApi } from '../../workbench/api/workbench-api';
import type { TaskStage } from '../components/taskWorkContent';

export function useTaskContextEditor(taskId: string, data: TaskWorkContextResponse | null, refresh: () => Promise<TaskWorkContextResponse | null>) {
  const taskRef = useRef(taskId);
  taskRef.current = taskId;
  const [mode, setMode] = useState<'edit' | 'respond' | null>(null);
  const [snapshot, setSnapshot] = useState<TaskWorkContextResponse | null>(null);
  const [progress, setProgress] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [stage, setStage] = useState<TaskStage | null>(null);
  const [response, setResponse] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => { setMode(null); setSnapshot(null); setMessage(null); setResponse(''); setConflict(false); setSaving(false); }, [taskId]);
  const open = (next: 'edit' | 'respond') => {
    if (!data) return;
    setSnapshot(data); setProgress(data.context?.progress || ''); setNextStep(data.context?.nextStep || ''); setStage(data.context?.stage || null);
    setResponse(''); setMessage(null); setConflict(false); setMode(next);
  };
  const save = async () => {
    if (!snapshot || saving) return;
    setSaving(true); setMessage(null);
    try {
      if (mode === 'respond') {
        const attention = snapshot.context?.attention;
        if (!response.trim() || !attention || !snapshot.contextDigest) { setMessage('请填写你的意见。'); return; }
        await workbenchApi.respond(taskId, { expectedContextDigest: snapshot.contextDigest, attentionId: attention.id, response: response.trim() });
      } else {
        if (!progress.trim() || !nextStep.trim()) { setMessage('请填写当前进展和下一步。'); return; }
        await workbenchApi.recordContext(taskId, { expectedContextDigest: snapshot.contextDigest || 'absent', progress: progress.trim(), nextStep: nextStep.trim(), stage });
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
    if (next && taskRef.current === taskId) {
      const previous = snapshot?.context;
      setProgress(draft => draft === (previous?.progress || '') ? next.context?.progress || '' : draft);
      setNextStep(draft => draft === (previous?.nextStep || '') ? next.context?.nextStep || '' : draft);
      setStage(draft => draft === (previous?.stage || null) ? next.context?.stage || null : draft);
      setSnapshot(next); setConflict(false); setMessage('已读取当前内容，请核对最新记录和你的输入后再保存。'); }
  };
  return { mode, open, close: () => { if (!saving) setMode(null); }, snapshot, progress, setProgress, nextStep, setNextStep, stage, setStage, response, setResponse, message, saving, conflict, save, reread };
}
