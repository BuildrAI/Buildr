import { useCallback, useEffect, useRef, useState } from 'react';

import { releaseAwarenessApi, type ReleaseAwareness } from '../api/release-awareness-api';
import { updateFlowApi, type UpdateFlowJob } from '../api/update-flow-api';

const CHECK_INTERVAL_MS = 60_000;
const PREPARING_INTERVAL_MS = 4_000;
const APPLYING_INTERVAL_MS = 2_000;

type Options = {
  enabled: boolean;
  onRestarting(): void;
  onCompleted?(): void;
};

/**
 * 全局更新入口状态：周期检查 Release Awareness，并跟踪页面内分阶段更新任务。
 * applying 期间快速轮询任务状态；实例不可达或任务状态重置时交给重启观察机制恢复页面。
 */
export function useUpdateFlow({ enabled, onRestarting, onCompleted }: Options) {
  const [awareness, setAwareness] = useState<ReleaseAwareness | null>(null);
  const [job, setJob] = useState<UpdateFlowJob | null>(null);
  const jobRef = useRef<UpdateFlowJob | null>(null);
  jobRef.current = job;
  const restarting = useRef(false);

  const check = useCallback((signal?: AbortSignal) => {
    void releaseAwarenessApi.inspect(signal)
      .then((value) => { if (!signal?.aborted) setAwareness(value); })
      .catch(() => {});
    void updateFlowApi.status(signal)
      .then((value) => { if (!signal?.aborted) setJob(value); })
      .catch(() => {});
  }, []);

  const checkJob = useCallback((signal?: AbortSignal) => {
    void updateFlowApi.status(signal)
      .then((value) => { if (!signal?.aborted) setJob(value); })
      .catch(() => {});
  }, []);

  // 周期检查：页面不可见时暂停，约一分钟一次。
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    check(controller.signal);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') check(controller.signal);
    }, CHECK_INTERVAL_MS);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [enabled, check]);

  // 活动任务加速轮询；applying 期间负责把页面交给重启观察机制。
  useEffect(() => {
    if (!enabled || !job || (job.status !== 'preparing' && job.status !== 'applying')) return;
    const controller = new AbortController();
    const interval = window.setInterval(() => {
      void updateFlowApi.status(controller.signal).then((next) => {
        if (controller.signal.aborted) return;
        setJob(next);
        if (jobRef.current?.status === 'applying' && next.status === 'completed') {
          if (onCompleted) onCompleted(); else window.location.reload();
        } else if (jobRef.current?.status === 'applying' && next.status === 'idle') {
          window.location.reload();
        }
      }).catch(() => {
        if (controller.signal.aborted || restarting.current) return;
        if (jobRef.current?.status === 'applying') {
          restarting.current = true;
          onRestarting();
        }
      });
    }, job.status === 'applying' ? APPLYING_INTERVAL_MS : PREPARING_INTERVAL_MS);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [enabled, job?.status, onRestarting, onCompleted]);

  const prepare = useCallback(async (track: string, expectedVersion: string) => {
    const next = await updateFlowApi.prepare({ track: track as 'stable' | 'candidate', expectedVersion });
    setJob(next);
    return next;
  }, []);

  const apply = useCallback(async (expectedVersion: string) => {
    const next = await updateFlowApi.apply({ expectedVersion });
    setJob(next);
    return next;
  }, []);

  return { awareness, job, check, checkJob, prepare, apply };
}
