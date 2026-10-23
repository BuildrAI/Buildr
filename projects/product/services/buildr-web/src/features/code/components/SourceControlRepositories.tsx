import { useContext, type ReactElement, type ReactNode } from 'react';
import { App, Button, Empty, Space, Tooltip } from 'antd';
import { BookOutlined, BranchesOutlined, CloudDownloadOutlined, CopyOutlined, DownOutlined, FileOutlined, InfoCircleOutlined, LoadingOutlined, ProjectOutlined, RightOutlined, UndoOutlined } from '@ant-design/icons';
import { SelectableHoverCard } from '../../../components/SelectableHoverCard';
import { copyText } from '../../../lib/copyText';
import { ChangedFileList, changedFileKey, type ChangedFileEntry } from '../../task/components/TaskChangedFiles';
import { sourceControlWorkingChanges, sourceControlFileKey, sourceControlFileTooltip, sourceControlFilePathHints, sourceControlVisibleWorktrees, sourceControlWorktreeKey, type SourceControlChange, type SourceControlRepository, type SourceControlWorktree } from '../source-control-model';
import { SourceControlWorktreeStatus } from './SourceControlWorktreeStatus';
import { SourceControlSourceRow } from './SourceControlSourceRow';
import { codeRepositoryCode, codeRepositoryLabel } from '../code-source-labels';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import '../source-control-row-actions.css';

export const layerFile = (file: SourceControlChange, version?: string): ChangedFileEntry => ({ ...file, repositoryId: JSON.stringify([file.repositoryId, file.worktreeId || '', version || file.area]) });
export const worktreeLabel = (worktree: SourceControlWorktree) => worktree.isMain ? '主工作树' : worktree.name;
type FoldProps = { expanded: Record<string, boolean>; onToggle(key: string, defaultExpanded?: boolean): void };
const open = (expanded: Record<string, boolean>, key: string, defaultExpanded = true) => expanded[key] ?? defaultExpanded;

function WorktreeLocationCard({repository, worktree, children, visible}: {repository: SourceControlRepository; worktree?: SourceControlWorktree; children: ReactElement; visible:boolean}) {
  const { message } = App.useApp();
  const viewActive = useContext(WorkspaceViewActiveContext);
  const location = worktree?.location || repository.location;
  const branch = worktree?.branch || worktree?.head || '—';
  const taskLabel = worktree?.taskId ? worktree.taskTitle || worktree.taskId : !worktree || worktree.taskDiagnostic ? '关联未确认' : '未关联';
  const copy = async (text: string) => {
    if (await copyText(text)) message.success('已复制');
    else message.info('可以选中文字复制。');
  };
  return <WorkspaceViewActiveContext.Provider value={viewActive && visible}><SelectableHoverCard sideBoundary=".source-control-sidebar" focusTrigger="keyboard" closeOnTriggerClick content={<article className="source-control-worktree-info" aria-label="工作树来源信息">
    <p className="source-control-worktree-info-task"><strong>任务：{taskLabel}</strong></p>
    <p className="source-control-worktree-info-location">{codeRepositoryLabel(repository)} · 工作树 · {worktree ? worktreeLabel(worktree) : '未读取'}</p>
    <dl><dt>路径</dt><dd><code>{location || '目录不可读取'}</code></dd><dt>{worktree?.branch ? '分支' : '提交'}</dt><dd><code>{branch}</code></dd><dt>目录角色</dt><dd>{worktree ? [worktree.isRegistered && '工作空间登记目录', worktree.isMain && 'Git 主工作树'].filter(Boolean).join('、') || '独立工作树' : '尚未确认'}</dd></dl>
    {!worktree?.taskId && worktree?.taskDiagnostic && <p className="source-control-worktree-diagnostic">{worktree.taskDiagnostic}</p>}
    {!!worktree?.diagnostics.length && <p className="source-control-worktree-diagnostic">{worktree.diagnostics.join('；')}</p>}
    <Space wrap><Button size="small" aria-label="复制路径" icon={<CopyOutlined />} disabled={!location} onClick={() => void copy(location)}>复制路径</Button><Button size="small" aria-label={worktree?.branch ? '复制分支' : '复制提交标识'} icon={<CopyOutlined />} disabled={branch === '—'} onClick={() => void copy(branch)}>{worktree?.branch ? '复制分支' : '复制提交标识'}</Button></Space>
  </article>}>{children}</SelectableHoverCard></WorkspaceViewActiveContext.Provider>;
}

function TaskLink({worktree, onOpenTask}: {worktree?: SourceControlWorktree; onOpenTask(taskId: string): void}) {
  return <span className="source-control-task-slot">{worktree?.taskId ? <Tooltip title={'任务：' + (worktree.taskTitle || worktree.taskId)}><Button type="text" size="small" className="source-control-task-link" icon={<ProjectOutlined />} aria-label={'打开任务 ' + (worktree.taskTitle || worktree.taskId)} onClick={() => onOpenTask(worktree.taskId!)} /></Tooltip> : worktree?.taskDiagnostic ? <Tooltip title="任务：关联未确认"><InfoCircleOutlined aria-label={'任务关联未确认：' + worktree.taskDiagnostic} /></Tooltip> : null}</span>;
}

export type SourceControlRowContext = { branchVisible: boolean; rowVisible:boolean; onOpenTask(taskId: string): void };
export type TreeProps = FoldProps & {
  repositories: SourceControlRepository[]; ready: boolean; active: boolean; selectedWorktreeKey: string;
  onPick(repository: SourceControlRepository, worktree: SourceControlWorktree): void; onOpenTask(taskId: string): void;
  onClone?(repositoryId: string): void;
  renderWorktreeControl?(repository: SourceControlRepository, worktree: SourceControlWorktree, ready: boolean, context: SourceControlRowContext): ReactNode;
  renderWorktreeActions?(repository: SourceControlRepository, worktree: SourceControlWorktree, ready: boolean, context: SourceControlRowContext): ReactNode;
  syncAction?(repository: SourceControlRepository, worktree: SourceControlWorktree): {pending: boolean; run(): void};
};
function RepositoryCloneControl({repository, onClone}: {repository: SourceControlRepository; onClone(repositoryId: string): void}) {
  const clone = repository.clone, label = codeRepositoryLabel(repository);
  if (clone?.state === 'cloning') return <Tooltip title="正在后台克隆代码库"><Button type="text" size="small" className="source-control-row-menu-button" icon={<LoadingOutlined aria-hidden spin />} aria-label={'正在克隆代码库 ' + label} aria-busy="true" /></Tooltip>;
  return <Tooltip title={clone?.state === 'failed' ? `克隆失败：${clone.diagnostic || '原因未确认'}，可重试` : '克隆代码库到登记位置'}><Button type="text" size="small" className="source-control-row-menu-button" icon={<CloudDownloadOutlined aria-hidden />} aria-label={'克隆代码库 ' + label} onClick={() => onClone(repository.id)} /></Tooltip>;
}
export function SourceControlRepositoryTree({repositories, ready, active, selectedWorktreeKey, onPick, onOpenTask, onClone, renderWorktreeControl, renderWorktreeActions, syncAction, ...fold}: TreeProps) {
  const hasWorktreeActions = Boolean(renderWorktreeControl || renderWorktreeActions);
  function worktreeControl(repository: SourceControlRepository, worktree: SourceControlWorktree, branchVisible: boolean, rowVisible:boolean) {
    if (renderWorktreeControl) return <span className="source-control-row-branch-slot" data-prototype-position="worktree-row-branch" aria-hidden={!branchVisible || undefined} inert={!branchVisible} onClick={event => event.stopPropagation()}>{renderWorktreeControl(repository, worktree, ready, {branchVisible, rowVisible, onOpenTask})}</span>;
    return null;
  }
  function worktreeActions(repository: SourceControlRepository, worktree: SourceControlWorktree | undefined, branchVisible: boolean, rowVisible:boolean) {
    return renderWorktreeActions && <span className="source-control-row-action-slot" data-prototype-position="worktree-row-actions" onClick={event => event.stopPropagation()}>{worktree && renderWorktreeActions(repository, worktree, ready, {branchVisible, rowVisible, onOpenTask})}</span>;
  }
  const measurement = (name: string, worktree?: SourceControlWorktree) => JSON.stringify([name, worktree?.branch, worktree?.head, worktree?.upstream, worktree?.ahead, worktree?.behind, worktree?.fileCount, worktree?.status, worktree?.taskId, worktree?.taskDiagnostic]);
  return <section className={'source-control-repositories' + (hasWorktreeActions ? ' has-worktree-actions' : '')} data-prototype-position="repositories">
    <div className="source-control-repository-tree-scroll" aria-label="代码库与工作树列表">
    {repositories.map(repository => {
      const main = repository.worktrees.find(worktree => worktree.isMain);
      const children = repository.worktrees.filter(worktree => !worktree.isMain);
      const group = 'catalog-repo:' + repository.id, isOpen = open(fold.expanded, group), repositoryLabel = codeRepositoryLabel(repository), repositoryCode = codeRepositoryCode(repository);
      return <section key={repository.id} data-source-repository={repository.id}>
      <SourceControlSourceRow className={'source-control-repository' + (main && selectedWorktreeKey === sourceControlWorktreeKey(repository.id, main.worktreeId) ? ' is-selected' : '')} worktreeId={main?.worktreeId} active={active} measureKey={measurement(repositoryCode, main)}>{({branchVisible, shortcutsVisible}) => <>
        <button type="button" className="source-control-fold source-control-repository-fold" aria-label={(isOpen ? '折叠' : '展开') + '代码库 ' + repositoryLabel} aria-expanded={isOpen} onClick={() => fold.onToggle(group)}><span className="source-control-repository-chevron" aria-hidden="true">{isOpen ? <DownOutlined /> : <RightOutlined />}</span><BookOutlined /></button>
        <div className="source-control-row-copy"><WorktreeLocationCard repository={repository} worktree={main} visible={active}><button type="button" className="source-control-repository-copy" disabled={!main} onClick={() => main && onPick(repository, main)} aria-label={'查看主工作树 · ' + repositoryLabel} aria-pressed={Boolean(main && selectedWorktreeKey === sourceControlWorktreeKey(repository.id, main.worktreeId))}>
          <strong><span className="source-control-row-name-text">{repositoryCode}{repository.simulated && <small>模拟</small>}</span></strong>
        </button></WorktreeLocationCard>{main && worktreeControl(repository, main, branchVisible, active)}</div>
        <span className="source-control-row-shortcuts" aria-hidden={!shortcutsVisible || undefined} inert={!shortcutsVisible}><SourceControlWorktreeStatus worktree={main} name={repositoryLabel} visible={active && shortcutsVisible} syncAction={main && syncAction?.(repository, main)} /><TaskLink worktree={main} onOpenTask={onOpenTask} /></span>
        {main ? worktreeActions(repository, main, branchVisible, active) : onClone && <span className="source-control-row-action-slot" onClick={event => event.stopPropagation()}><RepositoryCloneControl repository={repository} onClone={onClone} /></span>}
      </>}</SourceControlSourceRow>
      <div hidden={!isOpen} className="source-control-worktree-children">
        {children.map(worktree => <div key={worktree.worktreeId} data-source-worktree={worktree.worktreeId}>
          <SourceControlSourceRow className={'source-control-worktree' + (selectedWorktreeKey === sourceControlWorktreeKey(repository.id, worktree.worktreeId) ? ' is-selected' : '')} active={active && isOpen} measureKey={measurement(worktreeLabel(worktree), worktree)}>{({branchVisible, shortcutsVisible}) => <>
            <span className="source-control-worktree-icon" aria-hidden="true"><BranchesOutlined /></span>
            <div className="source-control-row-copy"><WorktreeLocationCard repository={repository} worktree={worktree} visible={active && isOpen}><button type="button" className="source-control-repository-copy" onClick={() => onPick(repository, worktree)} aria-label={'查看工作树 ' + worktreeLabel(worktree) + ' · ' + repositoryLabel} aria-pressed={selectedWorktreeKey === sourceControlWorktreeKey(repository.id, worktree.worktreeId)}>
              <strong><span className="source-control-row-name-text">{worktreeLabel(worktree)}</span></strong>
            </button></WorktreeLocationCard>{worktreeControl(repository, worktree, branchVisible, active && isOpen)}</div><span className="source-control-row-shortcuts" aria-hidden={!shortcutsVisible || undefined} inert={!shortcutsVisible}><SourceControlWorktreeStatus worktree={worktree} name={worktreeLabel(worktree)} visible={active && isOpen && shortcutsVisible} syncAction={syncAction?.(repository, worktree)} /><TaskLink worktree={worktree} onOpenTask={onOpenTask} /></span>
            {worktreeActions(repository, worktree, branchVisible, active && isOpen)}
          </>}</SourceControlSourceRow>
        </div>)}
      </div>
    </section>;})}
    {!repositories.length && <p className="source-control-catalog-note">{ready ? '尚未登记代码库。' : '正在读取代码库…'}</p>}
    </div>
  </section>;
}

type ChangesProps = FoldProps & { onDiscard?(repository: SourceControlRepository, worktree: SourceControlWorktree, file?: SourceControlChange): void; discardPending?: boolean; repositories: SourceControlRepository[]; names: string[]; exact: string[]; selectedKey: string | null; onPick(key: string): void; onRetry(id: string): void };
export function SourceControlChanges({repositories, names, exact, selectedKey, onPick, onRetry, onDiscard, discardPending, ...fold}: ChangesProps) {
  const visible = repositories.map(repository => ({repository, label: codeRepositoryLabel(repository), code: codeRepositoryCode(repository), worktrees: sourceControlVisibleWorktrees(repository, names, exact)})).filter(item => item.worktrees.length || item.repository.worktreeCount === null);
  const single = visible.length === 1 && visible[0].worktrees.length === 1;
  return <>{!visible.length && <div className="source-control-list-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有可查看的工作树" /></div>}{visible.map(({repository, label, code, worktrees}) => <section className={'source-control-change-group' + (single ? ' is-single-worktree' : '')} key={repository.id} data-change-repository={repository.id}>
    {!single && <button type="button" className="source-control-change-heading" title={label} aria-label={(open(fold.expanded, 'change-repo:' + repository.id) ? '折叠' : '展开') + '变更代码库 ' + label} aria-expanded={open(fold.expanded, 'change-repo:' + repository.id)} onClick={() => fold.onToggle('change-repo:' + repository.id)}>{open(fold.expanded, 'change-repo:' + repository.id) ? <DownOutlined /> : <RightOutlined />}<strong>{code}</strong><span>{repository.worktreeCount === null ? worktrees.length ? '已读 ' + worktrees.length + ' 个工作树 · 总数未知' : '数量未知' : worktrees.length + ' 个工作树'}</span></button>}
    <div hidden={!single && !open(fold.expanded, 'change-repo:' + repository.id)}>{repository.worktreeCount === null && !worktrees.length && <div className="source-control-local-failure"><p>工作树清单尚未确认。</p>{repository.diagnostics?.length ? <p>{repository.diagnostics.join('；')}</p> : null}<Button type="link" size="small" onClick={() => onRetry(repository.id)}>重新读取</Button></div>}{worktrees.map(worktree => {
      const identity = sourceControlWorktreeKey(repository.id, worktree.worktreeId), group = 'change-wt:' + identity;
      return <section className="source-control-change-worktree" key={identity} data-change-worktree={worktree.worktreeId}>
        {!single && <button type="button" className="source-control-change-heading" aria-label={(open(fold.expanded, group) ? '折叠' : '展开') + '变更工作树 ' + worktreeLabel(worktree)} aria-expanded={open(fold.expanded, group)} onClick={() => fold.onToggle(group)}>{open(fold.expanded, group) ? <DownOutlined /> : <RightOutlined />}<strong>{worktreeLabel(worktree)}</strong><code>{worktree.branch || '—'}</code><span>{worktree.fileCount ?? '未知'}</span></button>}
        <div hidden={!single && !open(fold.expanded, group)}>{worktree.status === 'offline' ? <div className="source-control-local-failure"><p>目录暂不可读取，变更数量尚未确认。</p><Button type="link" size="small" onClick={() => onRetry(repository.id)}>重新读取</Button></div> : !worktree.changes.length ? <p className="source-control-clean">{worktree.status === 'partial' || worktree.fileCount !== 0 ? '文件列表未完整读取，无法确认全部变更。' : <><FileOutlined /> 没有未提交文件</>}</p> : (() => {
          const changes = sourceControlWorkingChanges(worktree.changes), areaKey = 'changes:' + identity;
          const pathHints = sourceControlFilePathHints(changes);
          return <div className="source-control-change-area" data-change-area="working">
            <div className="source-control-changes-heading"><button type="button" className="source-control-area-heading" data-area-toggle="working" aria-label={(open(fold.expanded, areaKey) ? '折叠' : '展开') + '更改 ' + worktreeLabel(worktree)} aria-expanded={open(fold.expanded, areaKey)} onClick={() => fold.onToggle(areaKey)}>{open(fold.expanded, areaKey) ? <DownOutlined /> : <RightOutlined />}更改<span>{changes.length}</span></button>
            {onDiscard && <Tooltip title="丢弃所有更改"><Button className="source-control-discard-icon" size="small" type="text" loading={discardPending} disabled={discardPending || worktree.status !== 'ready'} icon={<UndoOutlined />} aria-label="丢弃所有更改" onClick={() => onDiscard(repository, worktree)} /></Tooltip>}</div>
            <div hidden={!open(fold.expanded, areaKey)}><ChangedFileList compact selectable renderFileAction={onDiscard ? entry => { const file = changes.find(file => file.path === entry.path); return file && <Tooltip title="丢弃更改"><Button className="source-control-discard-icon" type="text" size="small" icon={<UndoOutlined />} disabled={discardPending || worktree.status !== 'ready'} aria-label={'丢弃 ' + file.path + ' 的更改'} onClick={() => onDiscard(repository, worktree, file)} /></Tooltip>; } : undefined} filePathHint={file => pathHints.get(file.path)} fileTooltipPath={file => sourceControlFileTooltip(worktree.location, file)} files={changes.map(file => layerFile(file))} expanded={null} selectedKey={selectedKey} onExpand={key => { const file = changes.find(entry => changedFileKey(layerFile(entry)) === key); if (file) onPick(sourceControlFileKey(file)); }} /></div>
          </div>;
        })()}</div>
      </section>;
    })}</div>
  </section>)}</>;
}
