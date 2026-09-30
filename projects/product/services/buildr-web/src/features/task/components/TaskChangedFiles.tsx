import { App, Alert, Button, Spin, Tooltip } from 'antd';
import { BranchesOutlined, CheckOutlined, CopyOutlined, DownOutlined, ExpandOutlined, FileAddOutlined, FileSearchOutlined, FolderOpenOutlined, ReloadOutlined, RightOutlined, SwapOutlined } from '@ant-design/icons';
import { useState, type ReactNode } from 'react';
import { formatShortDateTime } from '../../../lib/taskLabels';
import './task-changed-files.css';

import type { TaskChangedFilesResult as TaskChangedFilesResultDto } from '../../../../build/generated/task-dto';
import type { TaskChangedFilesResult } from '../../../../build/generated/task-dto';

export type ChangedFileEntry = TaskChangedFilesResultDto['files'][number];
export type ChangedFileStatus = ChangedFileEntry['status'];
export type ChangedFileKind = ChangedFileEntry['kind'];
export type { TaskChangedFilesResult };

const STATUS_LABEL: Record<ChangedFileStatus, string> = {
  modified: 'M', added: 'A', deleted: 'D', renamed: 'R', conflicted: 'C', untracked: 'U',
};
const STATUS_TITLE: Record<ChangedFileStatus, string> = {
  modified: '已修改', added: '已暂存新增', deleted: '已删除', renamed: '已重命名', conflicted: '有冲突', untracked: '未跟踪',
};

function fileName(path: string) { return path.split('/').at(-1) || path; }
function fileDir(path: string) { const index = path.lastIndexOf('/'); return index < 0 ? '' : path.slice(0, index); }
export function changedFileKey(file: ChangedFileEntry) { return `${file.repositoryId}:${file.path}`; }
function domId(key: string) { return `changed-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`; }

/** File rows with expandable diff preview; shared by the working-tree pane, commit details and the diff rail. */
export function ChangedFileList({ files, expanded, onExpand, compact = false, onOpenDiff, selectedKey, selectable = false }: {
  files: ChangedFileEntry[]; expanded: string | null; onExpand(key: string | null): void; compact?: boolean; onOpenDiff?(file: ChangedFileEntry): void; selectedKey?: string | null; selectable?: boolean;
}) {
  const { message } = App.useApp();
  const [copied, setCopied] = useState('');
  async function copy(value: string, key: string) {
    try {
      if (!navigator.clipboard?.writeText) throw Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setCopied(key);
      message.success('已复制');
    } catch {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      const done = document.execCommand('copy');
      area.remove();
      if (done) { setCopied(key); message.success('已复制'); }
      else message.info('当前环境不允许访问剪贴板，请选中文字复制。');
    }
  }
  return <ol className={`task-changed-list${compact ? ' is-compact' : ''}`}>
    {files.map(file => {
      const key = changedFileKey(file);
      const open = expanded === key;
      return <li key={key} className={`${open ? 'is-open' : ''}${selectedKey === key ? ' is-selected' : ''}`}>
        <button className="task-changed-row" aria-expanded={open} aria-controls={domId(key)} onClick={() => onExpand(open ? null : key)}>
          <i className={`task-changed-status status-${file.status}${file.kind === 'untracked' ? ' status-untracked' : ''}`} title={file.kind === 'untracked' ? '未跟踪' : STATUS_TITLE[file.status]}>{file.kind === 'untracked' ? 'U' : STATUS_LABEL[file.status]}</i>
          <span className="task-changed-row-content"><strong>{fileName(file.path)}</strong><span className="task-changed-path" title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}>{file.previousPath && fileDir(file.previousPath) === fileDir(file.path) ? <>{fileDir(file.path)}<em className="task-changed-rename"><SwapOutlined /> {fileName(file.previousPath)}</em></> : file.previousPath ? <>{fileDir(file.previousPath)} <SwapOutlined /> {fileDir(file.path)}</> : fileDir(file.path)}</span></span>
          {file.additions !== null && <span className="task-changed-stats"><em>+{file.additions}</em><em>−{file.deletions ?? 0}</em></span>}
          {!selectable && <span className="task-commits-expand">{open ? <DownOutlined /> : <RightOutlined />}</span>}
        </button>
        {onOpenDiff && <Tooltip title="查看全文差异"><button type="button" className="task-changed-open" aria-label={`查看 ${fileName(file.path)} 全文差异`} onClick={event => { event.stopPropagation(); onOpenDiff(file); }}><ExpandOutlined /></button></Tooltip>}
        {open && <div className="task-commits-detail task-changed-detail" id={domId(key)} data-prototype-position="changes-diff">
          <div className="task-commits-detail-title"><h3>差异预览（Diff Preview）</h3><span className="task-changed-detail-actions">{onOpenDiff && <Button size="small" type="text" icon={<ExpandOutlined />} onClick={() => onOpenDiff(file)}>查看全文差异</Button>}{copied === `${key}-path` ? <Button size="small" type="text" icon={<CheckOutlined />}>已复制路径</Button> : <Button size="small" type="text" aria-label="复制路径" icon={<CopyOutlined />} onClick={() => void copy(file.path, `${key}-path`)}>复制路径</Button>}</span></div>
          <code className="task-changed-fullpath">{file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}</code>
          {file.preview
            ? <pre className="task-changed-diff">{file.preview.split('\n').map((line, index) => <span key={index} className={line.startsWith('+++') || line.startsWith('---') ? 'diff-meta' : line.startsWith('@@') ? 'diff-hunk' : line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : 'diff-ctx'}>{line}{'\n'}</span>)}</pre>
            : <p className="task-changed-nodiff">{file.kind === 'untracked' ? <><FileAddOutlined /> 未跟踪文件暂不可读取内容。</> : file.status === 'deleted' ? '文件已删除，不提供差异预览。' : file.status === 'renamed' ? '重命名文件内容未变化时不提供差异预览。' : '暂无可展示的差异预览。'}</p>}
        </div>}
      </li>;
    })}
  </ol>;
}

type Props = {
  taskId: string;
  data: TaskChangedFilesResult | null;
  loading?: boolean;
  error?: string;
  notice?: ReactNode;
  expanded: string | null;
  onExpand(key: string | null): void;
  onRetry(): void;
  onOpenCommitExample?(): void;
  onOpenFileDiff?(file: ChangedFileEntry): void;
  title?: string;
  showCoverage?: boolean;
};

/** Present working-tree observations without inferring completeness from an empty list. */
export function TaskChangedFiles({ taskId, data, loading = false, error = '', notice, expanded, onExpand, onRetry, onOpenCommitExample, onOpenFileDiff, title = '变更文件', showCoverage = true }: Props) {
  const files = data?.files || [];
  const repositories = data?.repositories || [];
  const repositoryById = new Map(repositories.map(repository => [repository.id, repository]));
  const groups = repositories
    .map(repository => ({ repository, files: files.filter(file => file.repositoryId === repository.id) }))
    .filter(group => group.files.length > 0 || group.repository.status === 'unavailable');
  const readFailed = error && !data;
  return <section className="task-changed-files" aria-label="任务变更文件" data-prototype-position="changes-pane">
    <div className="task-commits-heading">
      <div><h2>{title} {data && <span>{files.length}</span>}</h2><p>本任务工作区内尚未提交的改动，只读展示，不执行暂存、提交或回滚。</p></div>
      <Button size="small" aria-label="重新读取变更文件" loading={loading} onClick={onRetry}>重新读取</Button>
    </div>
    <div className="task-commits-source"><span><BranchesOutlined /> {repositories.map(repository => repository.label).join('、') || '本机仓库'} <small>本机工作区 · 只读</small></span><span>按仓库分组 · 改动在前</span></div>
    {data && (loading || error) && <Alert className="task-commits-warning" type={error ? 'warning' : 'info'} showIcon message={error ? '刷新失败，仍显示上次读取的变更。' : '正在重新读取变更文件…'} description={error || undefined} action={error ? <Button size="small" onClick={onRetry}>重新读取</Button> : undefined} />}
    {data?.status === 'partial' && <Alert className="task-commits-warning" data-prototype-position="changes-state" type="warning" showIcon message="变更文件读取不完整" description={<><p>部分仓库暂不可读取，以下保留已读取的内容，不能据此判断全部变更。</p>{data.diagnostics.length ? <ul>{data.diagnostics.map((item, index) => <li key={`${item.code}:${index}`}>{item.repositoryId && repositoryById.get(item.repositoryId) ? `${repositoryById.get(item.repositoryId)!.label}：` : ''}{item.message}</li>)}</ul> : null}</>} action={<Button size="small" loading={loading} onClick={onRetry}>重新读取</Button>} />}
    {!data && loading && <div className="task-commits-state" data-prototype-position="changes-state"><Spin size="small" /><h3>正在读取变更文件…</h3><p>正在检查任务关联仓库的工作区状态。</p></div>}
    {readFailed && <div className="task-commits-state" data-prototype-position="changes-state"><Alert type="warning" showIcon message="变更文件暂时不可读取" description={<>{error || '未能读取变更文件，请重试。'}<br />读取失败不代表没有改动。</>} /><Button aria-label="重新读取" icon={<ReloadOutlined />} onClick={onRetry}>重新读取</Button></div>}
    {data && !readFailed && !groups.length && <div className="task-commits-state" data-prototype-position="changes-state"><FileSearchOutlined className="task-commits-empty-icon" /><h3>当前范围内没有未提交改动</h3><p>可见仓库的工作区是干净的；任务工作树（Worktree）已清理时这里也不再有内容。</p></div>}
    {groups.map(group => <section key={group.repository.id} className="task-changed-repo" data-prototype-position="changes-repo">
      <header className="task-changed-repo-head">
        <span className="task-changed-repo-label"><FolderOpenOutlined /> <strong>{group.repository.label}</strong></span>
        {group.repository.branch && <code className="task-changed-repo-branch" title="当前分支"><BranchesOutlined /> {group.repository.branch}</code>}
        {(group.repository.ahead ?? 0) > 0 && <span className="task-changed-ahead" title={`本地领先远端 ${group.repository.ahead} 个提交`}>↑{group.repository.ahead}</span>}
        <span className="task-changed-repo-count">{group.repository.status === 'unavailable' ? '不可读取' : `${group.files.length} 项`}</span>
      </header>
      {group.repository.status === 'unavailable'
        ? <p className="task-changed-repo-error">该仓库暂不可读取，无法确认其中的未提交改动。</p>
        : <ChangedFileList files={group.files} expanded={expanded} onExpand={onExpand} onOpenDiff={onOpenFileDiff} />}
    </section>)}
    {data && groups.length > 0 && <p className="task-changed-tip" data-prototype-position="changes-tip">提交这些改动时，在说明末尾写入 <code>Buildr-Task: {taskId}</code>，提交便会归到下方“提交记录”。{onOpenCommitExample && <Button type="link" size="small" onClick={onOpenCommitExample}>查看提交说明示例</Button>}</p>}
    {data && showCoverage && <details className="task-commits-coverage"><summary>读取范围 · {formatShortDateTime(data.readAt)}</summary><p>检查任务工作树（Worktree）与任务范围内的仓库工作区状态；最多读取 {data.coverage.repositoryLimit} 个仓库，展示最多 {data.coverage.fileLimit} 个变更文件{data.coverage.truncated ? '，已达上限' : ''}。</p>{repositories.map(repository => <p key={repository.id}><strong>{repository.label}</strong> · {repository.status === 'complete' ? '已读取' : '不可用'}{repository.branch ? ` · ${repository.branch}` : ''}<br /><code>{repository.root}</code></p>)}</details>}
    {notice && <p className="task-commits-demo-note">{notice}</p>}
  </section>;
}
