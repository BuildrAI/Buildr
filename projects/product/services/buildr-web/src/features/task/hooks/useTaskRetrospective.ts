import { useCallback, useEffect, useRef, useState } from 'react';

import { taskApi } from '../api/task-api';
import type { TaskRetrospectiveDocumentResponse } from '../../../../build/generated/task-dto';

function failureMessage(cause: unknown, fallbackCode: string, fallbackMessage: string): string {
  if (!(cause instanceof Error)) return `${fallbackCode}：${fallbackMessage}`;
  const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : fallbackCode;
  return `${code}：${cause.message || fallbackMessage}`;
}

export function useTaskRetrospective(taskId: string, recordDigest: string, onRecordUpdated: () => Promise<void>) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [document, setDocument] = useState<TaskRetrospectiveDocumentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const taskRef = useRef(taskId);
  taskRef.current = taskId;
  const requestRef = useRef(0);
  useEffect(() => {
    setDocument(null); setError(null); setLoading(false); setUpdating(false);
    return () => { requestRef.current += 1; };
  }, [taskId]);

  const load = useCallback(async () => {
    if (taskRef.current !== taskId) return;
    const requestId = ++requestRef.current;
    setOpen(true);
    setLoading(true);
    setError(null);
    setDocument(null);
    try {
      const next = await taskApi.retrospectiveDocument(taskId);
      if (requestId === requestRef.current && taskRef.current === taskId) setDocument(next);
    } catch (cause) {
      if (requestId !== requestRef.current || taskRef.current !== taskId) return;
      setError(failureMessage(cause, 'task_retrospective_document_read_failed', '读取失败'));
      setDocument(null);
    } finally {
      if (requestId === requestRef.current && taskRef.current === taskId) setLoading(false);
    }
  }, [taskId]);

  const markDecided = async () => {
    const digest = document?.actualDigest;
    if (!digest || loading || updating) return false;
    setUpdating(true);
    setError(null);
    try {
      await taskApi.update(taskId, {
        expectedRecordDigest: recordDigest,
        retrospectiveState: 'decided',
        retrospectiveDocumentDigest: digest,
      });
      if (taskRef.current !== taskId) return false;
      requestRef.current += 1;
      await onRecordUpdated();
      await load();
      return true;
    } catch (cause) {
      if (taskRef.current !== taskId) return false;
      setError(failureMessage(cause, 'task_retrospective_decision_failed', '更新失败'));
      return false;
    } finally {
      if (taskRef.current === taskId) setUpdating(false);
    }
  };

  return { open, setOpen, loading, updating, document, error, load, markDecided };
}
