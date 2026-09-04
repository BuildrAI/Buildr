import { useCallback, useRef, useState } from 'react';

import { taskProfessionalApi } from '../../../api';
import { taskRecordApi } from '../api/task-record-api';
import type { ParentCoordinationResult } from '../components/parentCoordination';
import { isTaskReadCancelled, type TaskReadLifecycle } from './useTaskRequestLifecycle';

type ApiFailure = Error & { code?: string };

export function useTaskEvidence(taskId?: string, lifecycle?: TaskReadLifecycle) {
  const [coordinationData, setCoordinationData] = useState<ParentCoordinationResult | null>(null);
  const [coordinationLoading, setCoordinationLoading] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const coordinationRequest = useRef(0);
  const reviewRequest = useRef(0);
  const verificationRequest = useRef(0);

  const run = <T,>(operation: string, request: (signal: AbortSignal) => Promise<T>) => lifecycle && taskId
    ? lifecycle.run(taskId, operation, request)
    : request(new AbortController().signal);

  const refreshCoordination = useCallback(async () => {
    if (!taskId) return;
    const requestId = ++coordinationRequest.current;
    setCoordinationLoading(true);
    try {
      const next = await run('coordination', (signal) => taskProfessionalApi.coordination(taskId, { signal }));
      if (coordinationRequest.current === requestId) setCoordinationData(next);
    } catch (error) {
      if (!isTaskReadCancelled(error) && coordinationRequest.current === requestId) setCoordinationData({ diagnostic: { code: (error as ApiFailure).code || 'parent_coordination_read_failed', message: error instanceof Error ? error.message : '读取失败' } });
    } finally { if (coordinationRequest.current === requestId) setCoordinationLoading(false); }
  }, [taskId, lifecycle]);

  const refreshReview = useCallback(async () => {
    if (!taskId) return;
    const requestId = ++reviewRequest.current;
    setReviewLoading(true); setReviewError(null);
    try {
      const next = await run('reviews', (signal) => taskProfessionalApi.reviews(taskId, { signal }));
      if (reviewRequest.current === requestId) setReviewData(next);
    } catch (error) {
      if (!isTaskReadCancelled(error) && reviewRequest.current === requestId) setReviewError(`${(error as ApiFailure).code || 'task_review_read_failed'}：${error instanceof Error ? error.message : '读取失败'}`);
    } finally { if (reviewRequest.current === requestId) setReviewLoading(false); }
  }, [taskId, lifecycle]);

  const refreshVerification = useCallback(async () => {
    if (!taskId) return;
    const requestId = ++verificationRequest.current;
    setVerificationLoading(true); setVerificationError(null);
    try {
      const next = await run('verification', (signal) => taskProfessionalApi.verification(taskId, { signal }));
      if (verificationRequest.current === requestId) setVerificationData(next);
    } catch (error) {
      if (!isTaskReadCancelled(error) && verificationRequest.current === requestId) setVerificationError(`${(error as ApiFailure).code || 'task_verification_read_failed'}：${error instanceof Error ? error.message : '读取失败'}`);
    } finally { if (verificationRequest.current === requestId) setVerificationLoading(false); }
  }, [taskId, lifecycle]);

  const resetEvidence = useCallback(() => {
    coordinationRequest.current += 1; reviewRequest.current += 1; verificationRequest.current += 1;
    setCoordinationData(null); setCoordinationLoading(false); setReviewData(null); setReviewLoading(false); setReviewError(null); setVerificationData(null); setVerificationLoading(false); setVerificationError(null);
  }, []);

  return {
    coordinationData, coordinationLoading, reviewData, reviewLoading, reviewError,
    verificationData, verificationLoading, verificationError,
    refreshCoordination, refreshReview, refreshVerification,
    resetEvidence,
    retrospectiveDocument: taskRecordApi.retrospectiveDocument,
    updateRetrospective: taskRecordApi.update,
  };
}
