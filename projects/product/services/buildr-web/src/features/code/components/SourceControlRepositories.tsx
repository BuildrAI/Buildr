import type { CSSProperties, ReactElement } from 'react';
import { App, Button, Empty, Space, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, BranchesOutlined, CloudOutlined, CloudSyncOutlined, CopyOutlined, DownOutlined, FileOutlined, FileTextFilled, FileUnknownOutlined, FolderOpenOutlined, FolderOutlined, InfoCircleOutlined, ProjectOutlined, RightOutlined } from '@ant-design/icons';
import { SelectableHoverCard } from '../../../components/SelectableHoverCard';
import { copyText } from '../../../lib/copyText';
import { ChangedFileList, changedFileKey, type ChangedFileEntry } from '../../task/components/TaskChangedFiles';
import { sourceControlFileKey, sourceControlVisibleWorktrees, sourceControlWorktreeKey, type SourceControlChange, type SourceControlRepository, type SourceControlWorktree } from '../source-control-model';

export const areaLabels = { unstaged: '未暂存', staged: '已暂存', untracked: '未跟踪' };
export const layerFile = (file: SourceControlChange, version?: string): ChangedFileEntry => ({ ...file, repositoryId: JSON.stringify([file.repositoryId, file.worktreeId || '', version || file.area]) });
export const worktreeLabel = (worktree: SourceControlWorktree) => worktree.isMain ? '主工作树' : worktree.name;
type FoldProps = { expanded: Record<string, boolean>; onToggle(key: string, defaultExpanded?: boolean): void };
const open = (expanded: Record<string, boolean>, key: string, defaultExpanded = true) => expanded[key] ?? defaultExpanded;

/** All catalog rows share columns sized for their observed numeric values. */
function catalogColumns(repositories: SourceControlRepository[]): CSSProperties {
  const available = repositories.flatMap(repository => repository.worktrees).filter(worktree => worktree.status !== 'offline');
  const remoteCounts = available.filter(worktree => worktree.upstream !== null).flatMap(worktree => [worktree.ahead, worktree.behind]);
  const knownCounts = (counts: Array<number | null>) => counts.filter((count): count is number => count !== null && Number.isFinite(count) && count >= 0);
  const digits = (counts: number[]) => Math.max(1, ...counts.map(count => String(count).length));
  const remote = knownCounts(remoteCounts), files = knownCounts(available.map(worktree => worktree.fileCount));
  const remoteDigits = digits(remote), fileDigits = digits(files);
  return {
    '--source-control-remote-count-width': `${remoteDigits}ch`,
    '--source-control-remote-width': remote.some(count => count > 0) ? `calc(34px + ${remoteDigits * 2}ch)` : '26px',
    '--source-control-file-width': files.some(count => count > 0) ? `max(26px, calc(16px + ${fileDigits}ch))` : '26px',
  } as CSSProperties;
}

function WorktreeLocationCard({repository, worktree, children}: {repository: SourceControlRepository; worktree?: SourceControlWorktree; children: ReactElement}) {
  const { message } = App.useApp();
  const location = worktree?.location || repository.location;
  const branch = worktree?.branch || worktree?.head || '—';
  const taskLabel = worktree?.taskId ? worktree.taskTitle || worktree.taskId : !worktree || worktree.taskDiagnostic ? '关联未确认' : '未关联';
  const copy = async (text: string) => {
    if (await copyText(text)) message.success('已复制');
    else message.info('可以选中文字复制。');
  };
  return <SelectableHoverCard sideBoundary=".source-control-sidebar" focusTrigger="keyboard" closeOnTriggerClick content={<article className="source-control-worktree-info" aria-label="工作树来源信息">
    <p className="source-control-worktree-info-task"><strong>任务：{taskLabel}</strong></p>
    <p className="source-control-worktree-info-location">{repository.name} · 工作树 · {worktree ? worktreeLabel(worktree) : '未读取'}</p>
    <dl><dt>路径</dt><dd><code>{location || '目录不可读取'}</code></dd><dt>{worktree?.branch ? '分支' : '提交'}</dt><dd><code>{branch}</code></dd></dl>
    {!worktree?.taskId && worktree?.taskDiagnostic && <p className="source-control-worktree-diagnostic">{worktree.taskDiagnostic}</p>}
    {!!worktree?.diagnostics.length && <p className="source-control-worktree-diagnostic">{worktree.diagnostics.join('；')}</p>}
    <Space wrap><Button size="small" aria-label="复制路径" icon={<CopyOutlined />} disabled={!location} onClick={() => void copy(location)}>复制路径</Button><Button size="small" aria-label={worktree?.branch ? '复制分支' : '复制提交标识'} icon={<CopyOutlined />} disabled={branch === '—'} onClick={() => void copy(branch)}>{worktree?.branch ? '复制分支' : '复制提交标识'}</Button></Space>
  </article>}>{children}</SelectableHoverCard>;
}

function WorktreeStatus({worktree}: {worktree?: SourceControlWorktree}) {
  const unavailable = !worktree || worktree.status === 'offline';
  const untracked = !unavailable && worktree.upstream === null;
  const remoteUnknown = !unavailable && !untracked && (worktree.ahead === null || worktree.behind === null);
  const synchronized = !unavailable && !untracked && !remoteUnknown && worktree.ahead === 0 && worktree.behind === 0;
  const remoteLabel = unavailable ? '远程状态不可读取' : untracked ? '未跟踪远程分支' : remoteUnknown ? '远程提交数量未知' : synchronized ? '本地与远程没有提交差异' : `未推送 ${worktree.ahead} 个提交，远程未同步 ${worktree.behind} 个提交`;
  const fileLabel = unavailable ? '未提交文件数量不可读取' : worktree.fileCount === null ? '未提交文件数量未知' : worktree.fileCount === 0 ? '没有未提交文件' : `${worktree.fileCount} 个未提交文件`;
  return <span className="source-control-worktree-status">
    <Tooltip title={remoteLabel}><span className={'source-control-remote-status' + (synchronized ? ' is-clear' : '') + (untracked ? ' is-untracked' : '')} aria-label={remoteLabel}>
      {unavailable || untracked || remoteUnknown ? <CloudOutlined /> : synchronized ? <CloudSyncOutlined /> : <><span className="source-control-remote-direction"><ArrowUpOutlined /><span className="source-control-remote-count">{worktree.ahead}</span></span><span className="source-control-remote-direction"><ArrowDownOutlined /><span className="source-control-remote-count">{worktree.behind}</span></span></>}
    </span></Tooltip>
    <Tooltip title={fileLabel}><span className={'source-control-file-status' + (!unavailable && worktree.fileCount === 0 ? ' is-clear' : '') + (!unavailable && worktree.fileCount !== null && worktree.fileCount > 0 ? ' is-changed' : '')} aria-label={fileLabel}>
      {unavailable || worktree.fileCount === null ? <FileUnknownOutlined /> : worktree.fileCount === 0 ? <FileOutlined /> : <><FileTextFilled /><span className="source-control-file-count">{worktree.fileCount}</span></>}
    </span></Tooltip>
  </span>;
}

function TaskLink({worktree, onOpenTask}: {worktree?: SourceControlWorktree; onOpenTask(taskId: string): void}) {
  return <span className="source-control-task-slot">{worktree?.taskId ? <Tooltip title={'任务：' + (worktree.taskTitle || worktree.taskId)}><Button type="text" size="small" className="source-control-task-link" icon={<ProjectOutlined />} aria-label={'打开任务 ' + (worktree.taskTitle || worktree.taskId)} onClick={() => onOpenTask(worktree.taskId!)} /></Tooltip> : worktree?.taskDiagnostic ? <Tooltip title="任务：关联未确认"><InfoCircleOutlined aria-label={'任务关联未确认：' + worktree.taskDiagnostic} /></Tooltip> : null}</span>;
}

type TreeProps = FoldProps & {
  repositories: SourceControlRepository[]; ready: boolean; selectedWorktreeKey: string;
  onPick(repository: SourceControlRepository, worktree: SourceControlWorktree): void; onOpenTask(taskId: string): void;
};
export function SourceControlRepositoryTree({repositories, ready, selectedWorktreeKey, onPick, onOpenTask, ...fold}: TreeProps) {
  return <section className="source-control-repositories" data-prototype-position="repositories" style={catalogColumns(repositories)}>
    <div className="source-control-repository-tree-scroll" aria-label="代码库与工作树列表">
    {repositories.map(repository => {
      const main = repository.worktrees.find(worktree => worktree.isMain);
      const children = repository.worktrees.filter(worktree => !worktree.isMain);
      const group = 'catalog-repo:' + repository.id, isOpen = open(fold.expanded, group);
      return <section key={repository.id} data-source-repository={repository.id}>
      <div className={'source-control-repository' + (main && selectedWorktreeKey === sourceControlWorktreeKey(repository.id, main.worktreeId) ? ' is-selected' : '')} data-source-worktree={main?.worktreeId}>
        <button type="button" className="source-control-fold source-control-repository-fold" aria-label={(isOpen ? '折叠' : '展开') + '代码库 ' + repository.name} aria-expanded={isOpen} onClick={() => fold.onToggle(group)}>{isOpen ? <FolderOpenOutlined /> : <FolderOutlined />}</button>
        <WorktreeLocationCard repository={repository} worktree={main}><button type="button" className="source-control-repository-copy" disabled={!main} onClick={() => main && onPick(repository, main)} aria-label={'查看主工作树 · ' + repository.name} aria-pressed={Boolean(main && selectedWorktreeKey === sourceControlWorktreeKey(repository.id, main.worktreeId))}>
          <strong>{repository.name}{repository.simulated && <small>模拟</small>}</strong><code className="source-control-repository-branch">{main?.branch || main?.head?.slice(0, 8) || '—'}</code>
        </button></WorktreeLocationCard>
        <WorktreeStatus worktree={main} /><TaskLink worktree={main} onOpenTask={onOpenTask} />
      </div>
      <div hidden={!isOpen} className="source-control-worktree-children">
        {children.map(worktree => <div key={worktree.worktreeId} data-source-worktree={worktree.worktreeId}>
          <div className={'source-control-worktree' + (selectedWorktreeKey === sourceControlWorktreeKey(repository.id, worktree.worktreeId) ? ' is-selected' : '')}>
            <span className="source-control-worktree-icon" aria-hidden="true"><BranchesOutlined /></span>
            <WorktreeLocationCard repository={repository} worktree={worktree}><button type="button" className="source-control-repository-copy" onClick={() => onPick(repository, worktree)} aria-label={'查看工作树 ' + worktreeLabel(worktree) + ' · ' + repository.name} aria-pressed={selectedWorktreeKey === sourceControlWorktreeKey(repository.id, worktree.worktreeId)}>
              <strong>{worktreeLabel(worktree)}</strong><code className="source-control-repository-branch">{worktree.branch || worktree.head?.slice(0, 8) || '—'}</code>
            </button></WorktreeLocationCard><WorktreeStatus worktree={worktree} /><TaskLink worktree={worktree} onOpenTask={onOpenTask} />
          </div>
        </div>)}
      </div>
    </section>;})}
    {!repositories.length && <p className="source-control-catalog-note">{ready ? '尚未登记代码库。' : '正在读取代码库…'}</p>}
    </div>
  </section>;
}

type ChangesProps = FoldProps & { repositories: SourceControlRepository[]; names: string[]; exact: string[]; selectedKey: string | null; onPick(key: string): void; onRetry(id: string): void };
export function SourceControlChanges({repositories, names, exact, selectedKey, onPick, onRetry, ...fold}: ChangesProps) {
  const visible = repositories.map(repository => ({repository, worktrees: sourceControlVisibleWorktrees(repository, names, exact)})).filter(item => item.worktrees.length || item.repository.worktreeCount === null);
  const single = visible.length === 1 && visible[0].worktrees.length === 1;
  return <>{!visible.length && <div className="source-control-list-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有可查看的工作树" /></div>}{visible.map(({repository, worktrees}) => <section className={'source-control-change-group' + (single ? ' is-single-worktree' : '')} key={repository.id} data-change-repository={repository.id}>
    {!single && <button type="button" className="source-control-change-heading" aria-label={(open(fold.expanded, 'change-repo:' + repository.id) ? '折叠' : '展开') + '变更代码库 ' + repository.name} aria-expanded={open(fold.expanded, 'change-repo:' + repository.id)} onClick={() => fold.onToggle('change-repo:' + repository.id)}>{open(fold.expanded, 'change-repo:' + repository.id) ? <DownOutlined /> : <RightOutlined />}<strong>{repository.name}</strong><span>{repository.worktreeCount === null ? worktrees.length ? '已读 ' + worktrees.length + ' 个工作树 · 总数未知' : '数量未知' : worktrees.length + ' 个工作树'}</span></button>}
    <div hidden={!single && !open(fold.expanded, 'change-repo:' + repository.id)}>{repository.worktreeCount === null && !worktrees.length && <div className="source-control-local-failure"><p>工作树清单尚未确认。</p>{repository.diagnostics?.length ? <p>{repository.diagnostics.join('；')}</p> : null}<Button type="link" size="small" onClick={() => onRetry(repository.id)}>重新读取</Button></div>}{worktrees.map(worktree => {
      const identity = sourceControlWorktreeKey(repository.id, worktree.worktreeId), group = 'change-wt:' + identity;
      return <section className="source-control-change-worktree" key={identity} data-change-worktree={worktree.worktreeId}>
        {!single && <button type="button" className="source-control-change-heading" aria-label={(open(fold.expanded, group) ? '折叠' : '展开') + '变更工作树 ' + worktreeLabel(worktree)} aria-expanded={open(fold.expanded, group)} onClick={() => fold.onToggle(group)}>{open(fold.expanded, group) ? <DownOutlined /> : <RightOutlined />}<strong>{worktreeLabel(worktree)}</strong><code>{worktree.branch || '—'}</code><span>{worktree.fileCount ?? '未知'}</span></button>}
        <div hidden={!single && !open(fold.expanded, group)}>{worktree.status === 'offline' ? <div className="source-control-local-failure"><p>目录暂不可读取，变更数量尚未确认。</p><Button type="link" size="small" onClick={() => onRetry(repository.id)}>重新读取</Button></div> : !worktree.changes.length ? <p className="source-control-clean">{worktree.status === 'partial' || worktree.fileCount !== 0 ? '文件列表未完整读取，无法确认全部变更。' : <><FileOutlined /> 没有未提交文件</>}</p> : (Object.keys(areaLabels) as Array<keyof typeof areaLabels>).map(area => {
          const changes = worktree.changes.filter(file => file.area === area), areaKey = 'area:' + identity + ':' + area;
          return changes.length ? <div className="source-control-change-area" data-change-area={area} key={area}>
            <button type="button" className="source-control-area-heading" data-area-toggle={area} aria-label={(open(fold.expanded, areaKey) ? '折叠' : '展开') + areaLabels[area] + ' ' + worktreeLabel(worktree)} aria-expanded={open(fold.expanded, areaKey)} onClick={() => fold.onToggle(areaKey)}>{open(fold.expanded, areaKey) ? <DownOutlined /> : <RightOutlined />}{areaLabels[area]}<span>{changes.length}</span></button>
            <div hidden={!open(fold.expanded, areaKey)}><ChangedFileList compact selectable files={changes.map(file => layerFile(file))} expanded={null} selectedKey={selectedKey} onExpand={key => { const file = changes.find(entry => changedFileKey(layerFile(entry)) === key); if (file) onPick(sourceControlFileKey(file)); }} /></div>
          </div> : null;
        })}</div>
      </section>;
    })}</div>
  </section>)}</>;
}
