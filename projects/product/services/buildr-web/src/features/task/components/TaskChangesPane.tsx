import { useMemo, useState } from 'react';
import { Spin } from 'antd';
import { useTaskChangedFiles } from '../hooks/useTaskChangedFiles';
import { TaskDiffReader, type RailRepository } from './TaskDiffReader';
import { changedFileKey } from './TaskChangedFiles';
import { taskCommitKey, type TaskCommit } from './task-commit-model';

type Changed = ReturnType<typeof useTaskChangedFiles>;

/** Task-scoped workbench: repository tree of worktree changes + task commits, diff pane on the right. Data is read once at page level so the tab badge is precomputed. */
export function TaskChangesPane({ changed }: { changed: Changed }) {
  const [selected, setSelected] = useState<string | null>(null);
  const data = changed.data;
  const repositories = useMemo<RailRepository[]>(() => (data?.repositories || []).map(repository => ({
    id: repository.id, label: repository.label, root: repository.root,
    branch: repository.branch, ahead: repository.ahead, status: repository.status,
    changes: (data?.files || []).filter(file => file.repositoryId === repository.id),
    commits: (data?.commits || []).filter(commit => commit.repositoryId === repository.id).map(commit => ({ key: taskCommitKey(commit), commit: commit as TaskCommit, files: data?.commitFiles?.[taskCommitKey(commit)] || [] })),
  })), [data]);
  const firstKey = data?.files[0] ? changedFileKey(data.files[0]) : null;
  const effective = selected ?? firstKey;
  const coverageNote = data ? `读取范围：${data.repositories.map(repository => repository.label).join('、') || '本机仓库'} · 最多 ${data.coverage.repositoryLimit} 个仓库 / ${data.coverage.fileLimit} 个文件${data.coverage.truncated ? '，已达上限' : ''}` : '';
  if (changed.loading && !data) return <div className="task-commits-state"><Spin size="small" /><h3>正在读取变更文件…</h3><p>正在检查任务关联仓库的工作区状态。</p></div>;
  return <TaskDiffReader
    repositories={repositories} selected={effective} onSelect={setSelected}
    notice={data ? `${coverageNote}${changed.error ? ` · ${changed.error}` : ''}` : changed.error ? `变更文件暂不可读取：${changed.error}` : undefined}
  />;
}
