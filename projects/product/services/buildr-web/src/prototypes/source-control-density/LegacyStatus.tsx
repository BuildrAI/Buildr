import type { CSSProperties } from 'react';
import { Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CloudOutlined, CloudSyncOutlined, FileOutlined, FileTextFilled, FileUnknownOutlined } from '@ant-design/icons';
import type { SourceControlRepository, SourceControlWorktree } from '../../features/code/source-control-model';

/** Before-change comparison only; the adopted page uses the product status component. */
export function LegacyStatus({worktree}: {worktree: SourceControlWorktree}) {
  const unavailable = worktree.status === 'offline', untracked = !unavailable && worktree.upstream === null;
  const remoteUnknown = !unavailable && !untracked && (worktree.ahead === null || worktree.behind === null);
  const synchronized = !unavailable && !untracked && !remoteUnknown && worktree.ahead === 0 && worktree.behind === 0;
  const remote = unavailable ? '远程状态不可读取' : untracked ? '未跟踪远程分支' : remoteUnknown ? '远程提交数量未知' : synchronized ? '本地与远程没有提交差异' : `未推送 ${worktree.ahead} 个提交，远程未同步 ${worktree.behind} 个提交`;
  const files = unavailable ? '未提交文件数量不可读取' : worktree.fileCount === null ? '未提交文件数量未知' : worktree.fileCount === 0 ? '没有未提交文件' : `${worktree.fileCount} 个未提交文件`;
  return <span className="density-legacy-status">
    <Tooltip title={remote}><span className={'source-control-remote-status' + (synchronized ? ' is-clear' : '') + (untracked ? ' is-untracked' : '')} aria-label={remote}>
      {unavailable || untracked || remoteUnknown ? <CloudOutlined /> : synchronized ? <CloudSyncOutlined /> : <><span className="source-control-remote-direction"><ArrowUpOutlined /><span className="source-control-remote-count">{worktree.ahead}</span></span><span className="source-control-remote-direction"><ArrowDownOutlined /><span className="source-control-remote-count">{worktree.behind}</span></span></>}
    </span></Tooltip>
    <Tooltip title={files}><span className={'source-control-file-status' + (!unavailable && worktree.fileCount === 0 ? ' is-clear' : '')} aria-label={files}>
      {unavailable || worktree.fileCount === null ? <FileUnknownOutlined /> : worktree.fileCount === 0 ? <FileOutlined /> : <><FileTextFilled /><span className="source-control-file-count">{worktree.fileCount}</span></>}
    </span></Tooltip>
  </span>;
}

export function legacyCatalogColumns(repositories: SourceControlRepository[]): CSSProperties {
  const available = repositories.flatMap(repository => repository.worktrees).filter(worktree => worktree.status !== 'offline');
  const known = (counts: Array<number | null>) => counts.filter((count): count is number => count !== null && Number.isFinite(count) && count >= 0);
  const remote = known(available.filter(worktree => worktree.upstream !== null).flatMap(worktree => [worktree.ahead, worktree.behind])), files = known(available.map(worktree => worktree.fileCount));
  const digits = (counts: number[]) => Math.max(1, ...counts.map(count => String(count).length));
  return {'--source-control-remote-count-width':`${digits(remote)}ch`, '--source-control-remote-width':remote.some(count => count > 0) ? `calc(34px + ${digits(remote) * 2}ch)` : '26px', '--source-control-file-width':files.some(count => count > 0) ? `max(26px, calc(16px + ${digits(files)}ch))` : '26px'} as CSSProperties;
}
