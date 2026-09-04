import { useState } from 'react';

import { taskApi } from '../api/task-api';
import type { TaskRetrospectiveDocumentResponse } from '../api/generated/task-dto';

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

  const load = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      setDocument(await taskApi.retrospectiveDocument(taskId));
    } catch (cause) {
      setError(failureMessage(cause, 'task_retrospective_document_read_failed', '读取失败'));
      setDocument(null);
    } finally {
      setLoading(false);
    }
  };

  const markDecided = async () => {
    const digest = document?.actualDigest;
    if (!digest) return;
    setUpdating(true);
    setError(null);
    try {
      await taskApi.update(taskId, {
        expectedRecordDigest: recordDigest,
        retrospectiveState: 'decided',
        retrospectiveDocumentDigest: digest,
      });
      await onRecordUpdated();
      setDocument((current) => current ? { ...current, registeredState: 'decided', effectiveState: 'decided' } : current);
    } catch (cause) {
      setError(failureMessage(cause, 'task_retrospective_decision_failed', '更新失败'));
    } finally {
      setUpdating(false);
    }
  };

  return { open, setOpen, loading, updating, document, error, load, markDecided };
}
