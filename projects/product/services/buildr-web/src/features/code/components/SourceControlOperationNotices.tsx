import { useEffect, useRef } from 'react';
import { notification } from 'antd';
import type { SourceControlFetchResult } from '../hooks/useSourceControlFetch';
import type { SourceControlSyncResult } from '../hooks/useSourceControlSync';
import type { SourceControlRepository } from '../source-control-model';
import { SourceControlFetchResults } from './SourceControlFetchResults';
import { SourceControlSyncResults } from './SourceControlSyncResults';
import './source-control-operation-notices.css';

type Props = {
  workspaceId: string;
  repositories: SourceControlRepository[];
  fetchResults: Record<string, SourceControlFetchResult>;
  syncResults: Record<string, SourceControlSyncResult>;
  onViewChanges(repositoryId: string, worktreeId: string): void;
};

/** Publish each new operation result once; catalog refreshes do not replay old outcomes. */
export function SourceControlOperationNotices({workspaceId, repositories, fetchResults, syncResults, onViewChanges}: Props) {
  const [notices, holder] = notification.useNotification({maxCount: 2, stack: false});
  const seen = useRef<{workspaceId: string; fetch: Props['fetchResults']; sync: Props['syncResults']}>({workspaceId, fetch: {}, sync: {}});
  useEffect(() => {
    if (seen.current.workspaceId !== workspaceId) seen.current = {workspaceId, fetch: {}, sync: {}};
    const changed = Object.entries(fetchResults).filter(([key, result]) => seen.current.fetch[key] !== result);
    seen.current.fetch = fetchResults;
    if (!changed.length) return;
    const succeeded = changed.filter(([, result]) => result.status === 'succeeded').length;
    if (succeeded === changed.length) {
      notices.destroy('code-fetch:' + workspaceId);
      return;
    }
    notices.open({
      key: 'code-fetch:' + workspaceId,
      message: '获取远程：' + succeeded + ' 成功 / ' + changed.length + ' 个代码库',
      description: <SourceControlFetchResults repositories={repositories} results={Object.fromEntries(changed)} />,
      type: 'warning',
      duration: 6, pauseOnHover: true, showProgress: true, placement: 'topRight',
      className: 'source-control-operation-notice', role: 'alert',
    });
  }, [workspaceId, fetchResults, repositories, notices]);
  useEffect(() => {
    if (seen.current.workspaceId !== workspaceId) seen.current = {workspaceId, fetch: {}, sync: {}};
    const changed = Object.entries(syncResults).filter(([key, result]) => seen.current.sync[key] !== result);
    seen.current.sync = syncResults;
    if (!changed.length) return;
    if (changed.every(([, result]) => result.status === 'succeeded')) {
      notices.destroy('code-sync:' + workspaceId);
      return;
    }
    notices.open({
      key: 'code-sync:' + workspaceId, message: '同步结果',
      description: <SourceControlSyncResults repositories={repositories} results={Object.fromEntries(changed)} onViewChanges={onViewChanges} />,
      type: 'warning',
      duration: 6, pauseOnHover: true, showProgress: true, placement: 'topRight',
      className: 'source-control-operation-notice', role: 'alert',
    });
  }, [workspaceId, syncResults, repositories, onViewChanges, notices]);
  useEffect(() => () => {
    notices.destroy('code-fetch:' + workspaceId);
    notices.destroy('code-sync:' + workspaceId);
  }, [workspaceId, notices]);
  return holder;
}
