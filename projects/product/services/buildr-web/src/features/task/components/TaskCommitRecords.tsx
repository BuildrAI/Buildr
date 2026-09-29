import { App, Button, Spin, Alert } from 'antd';
import { BranchesOutlined, CheckOutlined, CopyOutlined, DownOutlined, RightOutlined, ReloadOutlined } from '@ant-design/icons';
import { useState, type ReactNode } from 'react';
import type { TaskCommitsResult } from '../../../../build/generated/task-dto';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { taskCommitKey, taskCommitsState } from './task-commit-model';
import './task-commit-records.css';

type Props = {
  taskId: string;
  data: TaskCommitsResult | null;
  loading?: boolean;
  error?: string;
  notice?: ReactNode;
  expanded: string | null;
  exampleOpen: boolean;
  onExpand(key: string | null): void;
  onExample(open: boolean): void;
  onRetry(): void;
};

/** Present repository observations without inferring completeness from an empty list. */
export function TaskCommitRecords({ taskId, data, loading = false, error = '', notice, expanded, exampleOpen, onExpand, onExample, onRetry }: Props) {
  const { message } = App.useApp();
  const [copied, setCopied] = useState('');
  const state = taskCommitsState(data, loading, error);
  const commits = data?.commits || [];
  const repositories = new Map(data?.repositories.map(repository => [repository.id, repository]) || []);
  const labels = data?.repositories.map(repository => repository.label).join('、') || '本机仓库';
  const example = `feat(task): 展示关联提交记录\n\n在任务中查看提交主题、完整说明与哈希值。\n\nBuildr-Task: ${taskId}`;
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
  const copyButton = (value: string, key: string, label: string) => <Button size="small" type="text" aria-label={label} icon={copied === key ? <CheckOutlined /> : <CopyOutlined />} onClick={() => void copy(value, key)}>{copied === key ? '已复制' : label}</Button>;
  return <section className="task-commits" aria-label="任务提交记录" data-prototype-position="commit-records">
    <div className="task-commits-heading">
      <div><h2>提交记录 {data && <span>{commits.length}</span>}</h2><p>查看本任务留下的代码与文档改动。</p></div>
      <Button size="small" onClick={() => onExample(!exampleOpen)} aria-expanded={exampleOpen}>提交说明示例</Button>
    </div>
    <div className="task-commits-source"><span><BranchesOutlined /> {labels} <small>本机记录 · 包含未推送提交</small></span><span>提交时间 · 新至旧</span></div>
    {data && (loading || error) && <Alert className="task-commits-warning" type={error ? 'warning' : 'info'} showIcon message={error ? '刷新失败，仍显示上次读取的记录。' : '正在重新读取提交记录…'} description={error || undefined} action={error ? <Button size="small" onClick={onRetry}>重新读取</Button> : undefined} />}
    {state === 'partial' && <Alert className="task-commits-warning" data-prototype-position="commit-state" type="warning" showIcon message="提交记录读取不完整" description={<><p>部分内容无法确认。以下保留已读取的关联提交，不能据此判断全部提交。</p>{data?.diagnostics.length ? <ul>{data.diagnostics.map((item, index) => <li key={`${item.code}:${index}`}>{item.repositoryId && repositories.get(item.repositoryId) ? `${repositories.get(item.repositoryId)!.label}：` : ''}{item.hash && <code>{item.hash.slice(0, 8)} </code>}{item.message}</li>)}</ul> : null}</>} action={error ? undefined : <Button size="small" loading={loading} onClick={onRetry}>重新读取</Button>} />}
    {exampleOpen && <section className="task-commits-example" aria-label="提交说明示例" data-prototype-position="commit-example">
      <div className="task-commits-detail-title"><h3>在提交说明中写入任务编码</h3><Button type="text" size="small" onClick={() => onExample(false)}>收起示例</Button></div>
      <p>保留原来的主题和正文，在末尾另起一段添加下面这一行。一个任务可以有多次提交；通常每次提交只写一个任务编码。</p>
      <pre>{example}</pre>
      <div className="task-commits-example-actions">{copyButton(example, 'example', '复制示例')}{copyButton(`Buildr-Task: ${taskId}`, 'trailer', '复制任务标记')}</div>
    </section>}
    {state === 'loading' && <div className="task-commits-state" data-prototype-position="commit-state"><Spin size="small" /><h3>正在读取提交记录…</h3><p>正在查找与本任务关联的提交。</p></div>}
    {state === 'failure' && <div className="task-commits-state" data-prototype-position="commit-state"><Alert type="warning" showIcon message="提交记录暂时不可用" description={<>{error || '未能读取提交记录，请重试。'}<br />读取失败不代表没有提交。</>} /><Button aria-label="重新读取" icon={<ReloadOutlined />} onClick={onRetry}>重新读取</Button></div>}
    {state === 'empty' && <div className="task-commits-state" data-prototype-position="commit-state"><BranchesOutlined className="task-commits-empty-icon" /><h3>当前检查范围内暂无关联提交</h3><p>提交时在说明末尾写入本任务编码，记录便可归到这里。</p><code>Buildr-Task: {taskId}</code><Button onClick={() => onExample(true)}>查看提交说明示例</Button></div>}
    {commits.length > 0 && <ol className="task-commits-list">
      {commits.map(commit => {
        const key = taskCommitKey(commit);
        const open = expanded === key;
        return <li key={key} className={open ? 'is-open' : ''}>
          <button className="task-commits-row" aria-expanded={open} aria-controls={`commit-${key}`} onClick={() => onExpand(open ? null : key)}>
            <span className="task-commits-point" aria-hidden><BranchesOutlined /></span>
            <span className="task-commits-row-content"><strong>{commit.subject}</strong><span className="task-commits-meta"><code>{commit.shortHash}</code><span title={repositories.get(commit.repositoryId)?.root}>{repositories.get(commit.repositoryId)?.label || commit.repositoryId}</span><span title={commit.authorEmail}>{commit.authorName}</span><time dateTime={commit.committedAt}>{formatShortDateTime(commit.committedAt)}</time></span></span>
            <span className="task-commits-expand">{open ? <DownOutlined /> : <RightOutlined />}</span>
          </button>
          {open && <div className="task-commits-detail" id={`commit-${key}`} data-prototype-position="commit-detail">
            <div className="task-commits-detail-title"><h3>完整提交说明（Commit Message）</h3>{copyButton(commit.message, `${key}-message`, '复制完整说明')}</div>
            <pre>{commit.message}</pre>
            <div className="task-commits-hash"><span>完整哈希（Hash）</span><code>{commit.hash}</code>{copyButton(commit.hash, `${key}-hash`, '复制完整哈希')}</div>
          </div>}
        </li>;
      })}
    </ol>}
    {data && <details className="task-commits-coverage"><summary>读取范围 · {formatShortDateTime(data.readAt)}</summary><p>本机可达提交：{data.coverage.refs.join('、')}。最多读取 {data.coverage.repositoryLimit} 个仓库，每个仓库最多检查 {data.coverage.historyLimitPerRepository} 条含任务标记的候选提交，展示 {data.coverage.commitLimit} 条关联记录。</p>{data.repositories.map(repository => <p key={repository.id}><strong>{repository.label}</strong> · {repository.status === 'complete' ? '已读取' : repository.status === 'unavailable' ? '不可用' : '已达读取上限'} · 已检查 {repository.scannedCommitCount} 次提交<br /><code>{repository.root}</code></p>)}</details>}
    {notice && <p className="task-commits-demo-note">{notice}</p>}
  </section>;
}
