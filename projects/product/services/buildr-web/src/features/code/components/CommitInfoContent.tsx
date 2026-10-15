import { App, Button, Space, Tooltip } from 'antd';
import { BranchesOutlined, CopyOutlined, NodeIndexOutlined, ProjectOutlined, TagsOutlined } from '@ant-design/icons';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { copyText } from '../../../lib/copyText';
import type { SourceControlCommit } from '../source-control-model';

type Props = { commit: SourceControlCommit; onOpenTask(taskId: string): void; compact?: boolean };

/** Hover summaries and the fixed reader share the same observed commit and task identity. */
export function CommitInfoContent({commit, onOpenTask, compact = false}: Props) {
  const { message } = App.useApp();
  const copy = async (text: string) => {
    if (await copyText(text)) message.success('已复制');
    else message.info('可以选中文字复制。');
  };
  const fullText = `${commit.hash}\n${commit.authorName} <${commit.authorEmail}>\n${formatShortDateTime(commit.committedAt)}\n\n${commit.message}`;
  const lines = commit.message.split(/\r?\n/);
  const descriptionLines = (lines[0] === commit.subject ? lines.slice(1) : lines).join('\n').trim().split('\n');
  if (commit.taskId && descriptionLines.at(-1)?.trim() === `Buildr-Task: ${commit.taskId}`) descriptionLines.pop();
  const description = descriptionLines.join('\n').trim();
  return <article className={'source-control-commit-info ' + (compact ? 'is-summary' : 'is-detailed')} aria-label={compact ? '提交摘要' : '完整提交信息'}>
    <header className="source-control-commit-detail-heading"><NodeIndexOutlined /><h3>{commit.subject}</h3></header>
    {compact ? <><p className="source-control-commit-summary-meta"><span>{commit.authorName}</span><time>{formatShortDateTime(commit.committedAt)}</time></p><code className="source-control-commit-summary-hash">{commit.hash}</code></> : <dl>
      <dt>提交标识</dt><dd><code>{commit.hash}</code></dd><dt>作者</dt><dd>{commit.authorName} &lt;{commit.authorEmail}&gt;</dd><dt>提交时间</dt><dd>{formatShortDateTime(commit.committedAt)}</dd>
    </dl>}
    {(commit.branches.length > 0 || commit.tags.length > 0) && <div className="source-control-commit-detail-refs">
      {commit.branches.length > 0 && <span><BranchesOutlined /><code>{commit.branches.join(' · ')}</code></span>}{commit.tags.length > 0 && <span><TagsOutlined /><code>{commit.tags.join(' · ')}</code></span>}
    </div>}
    {!compact && description && <pre className="source-control-commit-message">{description}</pre>}
    <div className="source-control-commit-detail-task"><Tooltip title={'任务：' + (commit.taskId ? commit.taskTitle || commit.taskId : commit.taskDiagnostic ? '关联未确认' : '未关联')}><ProjectOutlined /></Tooltip><div><small>对应任务</small>{commit.taskId ? <><Button type="link" size="small" aria-label={'打开任务 ' + (commit.taskTitle || commit.taskId)} onClick={() => onOpenTask(commit.taskId!)}>{commit.taskTitle || commit.taskId}</Button>{!compact && <code>{commit.taskId}</code>}</> : <span>{commit.taskDiagnostic || '未关联任务'}</span>}</div></div>
    <Space wrap className="source-control-commit-detail-actions"><Button size="small" aria-label="复制完整信息" icon={<CopyOutlined />} onClick={() => void copy(fullText)}>复制完整信息</Button><Button size="small" aria-label="复制提交标识" icon={<CopyOutlined />} onClick={() => void copy(commit.hash)}>复制提交标识</Button></Space>
  </article>;
}
