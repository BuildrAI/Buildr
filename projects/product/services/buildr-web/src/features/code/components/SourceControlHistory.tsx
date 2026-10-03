import { Button, Spin, Tooltip } from 'antd';
import { BranchesOutlined, DownOutlined, NodeIndexOutlined, ProjectOutlined, RightOutlined } from '@ant-design/icons';
import { ChangedFileList, changedFileKey } from '../../task/components/TaskChangedFiles';
import { useSourceControlRead } from '../hooks/useSourceControlRead';
import { sourceControlCommit, type SourceControlChange, type SourceControlCommit, type SourceControlReader } from '../source-control-model';
import { CommitInfoPopover } from './CommitInfoPopover';
import { layerFile } from './SourceControlRepositories';

type Props = {
  expanded: Record<string, boolean>; onToggle(key: string, defaultExpanded?: boolean): void;
  commits: SourceControlCommit[]; selectedHash?: string; selectedFileKey: string | null;
  reader: SourceControlReader; readKey: string; version: string; repositoryId: string; worktreeId: string;
  onOpenTask(taskId: string): void; onSelect(commit: SourceControlCommit): void; onPick(commit: SourceControlCommit, file: SourceControlChange, baseHash: string | null): void;
};

/** Each expanded commit owns its immutable file observation; selecting a file opens the shared diff reader. */
export function SourceControlHistory(props: Props) {
  return <ol className="source-control-graph">{props.commits.map(commit => <CommitRow key={commit.hash} {...props} commit={commit} />)}</ol>;
}

function CommitRow({commit, expanded: expansion, onToggle, selectedHash, selectedFileKey, reader, readKey, version, repositoryId, worktreeId, onOpenTask, onSelect, onPick}: Props & {commit: SourceControlCommit}) {
  const identity = 'history:' + JSON.stringify([repositoryId, worktreeId, commit.hash]);
  const expanded = expansion[identity] ?? false;
  const input = {repositoryId, worktreeId, commitHash: commit.hash};
  const read = useSourceControlRead(JSON.stringify([readKey, input]), input, reader.commit, expanded, version);
  const detail = read.data ? sourceControlCommit(read.data.commit, read.data.files) : commit;
  const files = detail.files.map(file => layerFile(file, commit.hash));
  return <li className={commit.hash === selectedHash ? 'is-selected' : ''} data-source-commit={commit.hash}>
    <div className="source-control-history-row"><CommitInfoPopover sideBoundary=".source-control-sidebar" commit={detail} onOpenTask={onOpenTask}><button type="button" className="source-control-commit-toggle" aria-label={'查看提交 ' + commit.subject} aria-expanded={expanded} onClick={() => { if (!expanded || selectedHash !== commit.hash) onSelect(detail); onToggle(identity, false); }}>
      <span className="source-control-commit-icon"><NodeIndexOutlined /></span><span className="source-control-graph-copy"><strong>{commit.subject}</strong></span><span className="source-control-commit-list-meta"><code className="source-control-commit-hash">{commit.hash.slice(0, 8)}</code><time dateTime={commit.committedAt}>{new Date(commit.committedAt).toLocaleDateString('zh-CN', {month: 'numeric', day: 'numeric'})}</time></span>
    </button></CommitInfoPopover><div className="source-control-history-actions">
      {(commit.branches.length > 0 || commit.tags.length > 0) && <Tooltip title={[...commit.branches, ...commit.tags].join(' · ')}><span className="source-control-history-refs" aria-label={'提交引用 ' + [...commit.branches, ...commit.tags].join(' · ')}><BranchesOutlined /></span></Tooltip>}
      {commit.taskId && <Tooltip title={'任务：' + (commit.taskTitle || commit.taskId)}><Button type="text" size="small" className="source-control-task-link" icon={<ProjectOutlined />} aria-label={'打开提交任务 ' + (commit.taskTitle || commit.taskId)} onClick={() => onOpenTask(commit.taskId!)} /></Tooltip>}
      <Button type="text" size="small" className="source-control-history-fold" aria-label={(expanded ? '折叠提交 ' : '展开提交 ') + commit.subject} aria-expanded={expanded} icon={expanded ? <DownOutlined /> : <RightOutlined />} onClick={() => onToggle(identity, false)} />
    </div></div>
    {expanded && <div className="source-control-commit-children" aria-label={'提交变更文件 ' + commit.shortHash}>
      {read.loading && !read.data ? <div className="source-control-read-status"><Spin size="small" />正在读取提交文件…</div> : read.error && !read.data ? <div className="source-control-local-failure"><p>{read.error}</p><Button type="link" size="small" onClick={() => void read.refresh()}>重新读取提交文件</Button></div> : <>
        {read.error && <div className="source-control-local-failure"><p>刷新失败，保留已读取文件。{read.error}</p><Button type="link" size="small" onClick={() => void read.refresh()}>重试</Button></div>}
        {files.length ? <ChangedFileList compact selectable files={files} expanded={null} selectedKey={selectedHash === commit.hash ? selectedFileKey : null} onExpand={key => { const file = detail.files.find(item => changedFileKey(layerFile(item, commit.hash)) === key); if (file) onPick(detail, file, read.data?.baseHash ?? null); }} /> : read.data && <p className="source-control-clean">{read.data.coverage.truncated || read.data.diagnostics.length ? '文件列表未完整读取，无法确认全部变更。' : '该提交没有文件变更。'}</p>}
        {read.data?.coverage.truncated && <p className="source-control-list-note">提交文件达到读取上限，当前列表不完整。</p>}
        {read.data?.diagnostics.length ? <p className="source-control-list-note">{read.data.diagnostics.map(item => item.message).join('；')}</p> : null}
      </>}
    </div>}
  </li>;
}
