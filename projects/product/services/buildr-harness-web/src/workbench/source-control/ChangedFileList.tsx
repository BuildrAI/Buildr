import { Button, Tooltip } from 'antd';
import { DownOutlined, ExpandOutlined, FileAddOutlined, RightOutlined, SwapOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { CopyButton } from '../ui/CopyButton';
import type { ChangedFileEntry } from './read-contracts';
export type { ChangedFileEntry } from './read-contracts';
import './task-changed-files.css';

const STATUS_LABEL: Record<ChangedFileEntry['status'], string> = {
  modified: 'M', added: 'A', deleted: 'D', renamed: 'R', conflicted: 'C', untracked: 'U',
};
const STATUS_TITLE: Record<ChangedFileEntry['status'], string> = {
  modified: '已修改', added: '已暂存新增', deleted: '已删除', renamed: '已重命名', conflicted: '有冲突', untracked: '未跟踪',
};

function fileName(path: string) { return path.split('/').at(-1) || path; }
function fileDir(path: string) { const index = path.lastIndexOf('/'); return index < 0 ? '' : path.slice(0, index); }
export function changedFileKey(file: ChangedFileEntry) { return `${file.repositoryId}:${file.checkoutId ? `${file.checkoutId}:` : ''}${file.path}`; }
function domId(key: string) { return `changed-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`; }

/** File rows with expandable diff preview; shared by the working-tree pane, commit details and the diff rail. */
export function ChangedFileList({ files, expanded, onExpand, compact = false, onOpenDiff, selectedKey, selectable = false, fileTooltipPath, filePathHint, renderFileAction }: {
  renderFileAction?(file: ChangedFileEntry): ReactNode;
  files: ChangedFileEntry[]; expanded: string | null; onExpand(key: string | null): void; compact?: boolean; onOpenDiff?(file: ChangedFileEntry): void; selectedKey?: string | null; selectable?: boolean; fileTooltipPath?(file: ChangedFileEntry): string | undefined; filePathHint?(file: ChangedFileEntry): string | undefined;
}) {
  return <ol className={`task-changed-list${compact ? ' is-compact' : ''}`}>
    {files.map(file => {
      const key = changedFileKey(file);
      const open = expanded === key;
      const pathHint = filePathHint?.(file);
      const nameOnly = Boolean(filePathHint && !pathHint && !file.previousPath);
      const pathContent = filePathHint ? <>{pathHint}{file.previousPath && <em className="task-changed-rename"><SwapOutlined /> {fileName(file.previousPath) === fileName(file.path) ? '已移动' : `原名 ${fileName(file.previousPath)}`}</em>}</> : file.previousPath && fileDir(file.previousPath) === fileDir(file.path) ? <>{fileDir(file.path)}<em className="task-changed-rename"><SwapOutlined /> {fileName(file.previousPath)}</em></> : file.previousPath ? <>{fileDir(file.previousPath)} <SwapOutlined /> {fileDir(file.path)}</> : fileDir(file.path);
      const row = <button className="task-changed-row" aria-expanded={open} aria-controls={domId(key)} onClick={() => onExpand(open ? null : key)}>
          <i className={`task-changed-status status-${file.status}${file.kind === 'untracked' ? ' status-untracked' : ''}`} title={file.kind === 'untracked' ? '未跟踪' : STATUS_TITLE[file.status]}>{file.kind === 'untracked' ? 'U' : STATUS_LABEL[file.status]}</i>
          <span className={`task-changed-row-content${nameOnly ? ' is-name-only' : ''}`}><strong>{fileName(file.path)}</strong><span className="task-changed-path" data-file-path={file.path} title={fileTooltipPath ? undefined : file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}>{pathContent}</span></span>
          {file.additions !== null && <span className="task-changed-stats"><em>+{file.additions}</em><em>−{file.deletions ?? 0}</em></span>}
          {!selectable && <span className="task-commits-expand">{open ? <DownOutlined /> : <RightOutlined />}</span>}
        </button>;
      return <li key={key} className={`${open ? 'is-open' : ''}${selectedKey === key ? ' is-selected' : ''}`}>
        {fileTooltipPath ? <Tooltip title={fileTooltipPath(file) || '完整绝对路径暂不可读取'} rootClassName="task-changed-path-tooltip" placement="right" align={{offset: [0, 0]}} trigger={['hover', 'focus']} mouseEnterDelay={0.08} mouseLeaveDelay={0}>{row}</Tooltip> : row}
        {renderFileAction && <span className="task-changed-row-action">{renderFileAction(file)}</span>}
        {onOpenDiff && <Tooltip title="查看全文差异"><button type="button" className="task-changed-open" aria-label={`查看 ${fileName(file.path)} 全文差异`} onClick={event => { event.stopPropagation(); onOpenDiff(file); }}><ExpandOutlined /></button></Tooltip>}
        {open && <div className="task-commits-detail task-changed-detail" id={domId(key)} data-prototype-position="changes-diff">
          <div className="task-commits-detail-title"><h3>差异预览（Diff Preview）</h3><span className="task-changed-detail-actions">{onOpenDiff && <Button size="small" type="text" icon={<ExpandOutlined />} onClick={() => onOpenDiff(file)}>查看全文差异</Button>}<CopyButton type="text" text={file.path} failureMessage="当前环境不允许访问剪贴板，请选中文字复制。">复制路径</CopyButton></span></div>
          <code className="task-changed-fullpath">{file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}</code>
          {file.preview
            ? <pre className="task-changed-diff">{file.preview.split('\n').map((line, index) => <span key={index} className={line.startsWith('+++') || line.startsWith('---') ? 'diff-meta' : line.startsWith('@@') ? 'diff-hunk' : line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : 'diff-ctx'}>{line}{'\n'}</span>)}</pre>
            : <p className="task-changed-nodiff">{file.kind === 'untracked' ? <><FileAddOutlined /> 未跟踪文件暂不可读取内容。</> : file.status === 'deleted' ? '文件已删除，不提供差异预览。' : file.status === 'renamed' ? '重命名文件内容未变化时不提供差异预览。' : '暂无可展示的差异预览。'}</p>}
        </div>}
      </li>;
    })}
  </ol>;
}
