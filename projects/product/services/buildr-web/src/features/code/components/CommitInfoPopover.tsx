import { useState, type ReactElement } from 'react';
import { App, Button, Space, Tag } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { SelectableHoverCard } from '../../../components/SelectableHoverCard';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { copyText } from '../../../lib/copyText';
import type { SourceControlCommit } from './SourceControlWorkbench';

type Props = { commit: SourceControlCommit; children: ReactElement; onOpenTask(taskId: string): void };

/** Commit facts are available on demand; the caller keeps its list and reading layout. */
export function CommitInfoPopover({ commit, children, onOpenTask }: Props) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const copy = async (text: string) => {
    if (await copyText(text)) message.success('已复制');
    else message.info('可以选中文字复制。');
  };
  const fullText = `${commit.hash}\n${commit.authorName} <${commit.authorEmail}>\n${formatShortDateTime(commit.committedAt)}\n\n${commit.message}`;
  return <SelectableHoverCard open={open} onOpenChange={setOpen} title="提交信息" content={<article className="source-control-commit-info" aria-label="完整提交信息">
    <h3>{commit.subject}</h3>
    <dl><dt>提交标识</dt><dd><code>{commit.hash}</code></dd><dt>作者</dt><dd>{commit.authorName} &lt;{commit.authorEmail}&gt;</dd><dt>提交时间</dt><dd>{formatShortDateTime(commit.committedAt)}</dd></dl>
    {!!(commit.branches.length + commit.tags.length) && <div className="source-control-commit-info-refs">{commit.branches.map(ref => <Tag key={ref}>{ref}</Tag>)}{commit.tags.map(ref => <Tag key={ref} color="gold">{ref}</Tag>)}</div>}
    <pre>{commit.message}</pre>
    <div className="source-control-commit-info-task">{commit.taskId ? <Button type="link" size="small" onClick={() => { setOpen(false); onOpenTask(commit.taskId!); }}>{commit.taskTitle || commit.taskId}</Button> : <span>{commit.taskDiagnostic || '未关联任务'}</span>}</div>
    <Space wrap><Button size="small" icon={<CopyOutlined />} onClick={() => void copy(fullText)}>复制完整信息</Button><Button size="small" onClick={() => void copy(commit.hash)}>复制提交标识</Button></Space>
  </article>}>{children}</SelectableHoverCard>;
}
