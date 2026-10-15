import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { useTaskChangedFiles } from '../hooks/useTaskChangedFiles';
import { TaskDiffReader, type RailRepository, type RailCommit } from './TaskDiffReader';
import type { ChangedFileEntry } from './TaskChangedFiles';
import { changedFileKey } from './TaskChangedFiles';
import { taskCommitKey, type TaskCommit } from './task-commit-model';

type Changed = ReturnType<typeof useTaskChangedFiles>;
export type TaskChangesPaneProps = {
  changed: Changed;
  commitsOnly?: boolean;
  defaultCommit?: boolean;
  onOpenFile?(file: ChangedFileEntry, repository: RailRepository, commit?: RailCommit): void;
};

/** Task-scoped workbench: repository tree of worktree changes + task commits, diff pane on the right. Data is read once at page level so the tab badge is precomputed. */
export function TaskChangesPane({ changed, onOpenFile, commitsOnly = false, defaultCommit = false }: TaskChangesPaneProps) {
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  const data = changed.data;
  const repositories = useMemo<RailRepository[]>(() => (data?.repositories || []).map(repository => ({
    id: repository.id, label: repository.label, root: repository.root,
    branch: repository.branch, ahead: repository.ahead, status: repository.status,
    changes: commitsOnly ? [] : (data?.files || []).filter(file => file.repositoryId === repository.id),
    commits: (data?.commits || []).filter(commit => commit.repositoryId === repository.id).map(commit => ({ key: taskCommitKey(commit), commit: commit as TaskCommit, files: data?.commitFiles?.[taskCommitKey(commit)] || [] })),
  })), [data, commitsOnly]);
  const preferCommit = defaultCommit && Boolean(data?.commits.length);
  const firstKey = !commitsOnly && !preferCommit && data?.files[0] ? changedFileKey(data.files[0]) : null;
  useEffect(() => { setSelected(undefined); }, [changed.scopeKey]);
  useEffect(() => { if (selected === undefined && firstKey) setSelected(firstKey); }, [selected, firstKey]);
  const effective = selected === undefined ? firstKey : selected;
  const coverageNote = data ? `读取范围：${data.repositories.map(repository => repository.label).join('、') || '本机仓库'} · 最多 ${data.coverage.repositoryLimit} 个仓库 / ${data.coverage.fileLimit} 个文件${data.coverage.truncated ? '，已达上限' : ''}` : '';
  const title = commitsOnly ? '提交记录' : '文件与提交';
  if (changed.loading && !data) return <div className="task-changes-state"><Spin size="small" /><h3>正在读取{title}…</h3><p>正在检查任务关联仓库。</p></div>;
  if (!data && changed.error) return <div className="task-changes-state"><Alert type="warning" showIcon message={`${title}暂时不可用`} description={changed.error} /><Button onClick={() => void changed.refresh()}>重新读取</Button></div>;
  return <div className="task-changes-pane">
    {changed.error && <Alert type="warning" showIcon message="刷新失败，仍显示上次读取的记录。" description={changed.error} action={<Button size="small" onClick={() => void changed.refresh()}>重新读取</Button>} />}
    {data?.status === 'partial' && <Alert type="warning" showIcon message={`${title}读取不完整`} description={data.diagnostics.map(item => item.message).join('；') || '部分内容未能完整读取，当前列表不代表全部结果。'} action={<Button size="small" onClick={() => void changed.refresh()}>重新读取</Button>} />}
    <TaskDiffReader
    onOpenFile={onOpenFile}
    railTitle={title} defaultCommit={preferCommit} showTaskSource={commitsOnly}
    taskId={data?.taskId} readScope={changed.scopeKey} refreshVersion={data?.readAt} onRegisterRefresh={changed.registerFullRefresh}
    repositories={repositories} selected={effective} onSelect={setSelected}
    notice={data ? `${coverageNote}${changed.error ? ` · ${changed.error}` : ''}` : changed.error ? `变更文件暂不可读取：${changed.error}` : undefined}
    />
  </div>;
}
