import { useEffect, useMemo, useState } from 'react';
import { TaskDiffReader, type RailCommit, type RailRepository } from '../../features/task/components/TaskDiffReader';
import { changedFileKey } from '../../features/task/components/TaskChangedFiles';
import { taskCommitKey } from '../../features/task/components/task-commit-model';
import type { SourceControlChange, SourceControlCommit } from '../../features/code/components/SourceControlWorkbench';
import { sourceControlRepositories, sourceControlTaskId } from './fixtures';

type Props = {
  taskId: string;
  onOpenFile(file: SourceControlChange, repository: RailRepository, commit?: RailCommit): void;
};
type PreviewRepository = { rail: RailRepository; changes: SourceControlChange[]; commits: SourceControlCommit[] };
const layerOrder = { staged: 0, unstaged: 1, untracked: 2 };
const lines = (text: string) => text ? (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n') : [];

/** Task changes compare HEAD with the resulting working file, rather than listing index layers twice. */
function mergeTaskChanges(files: SourceControlChange[]): SourceControlChange[] {
  const grouped = new Map<string, SourceControlChange[]>();
  for (const file of files) {
    const key = changedFileKey(file);
    grouped.set(key, [...(grouped.get(key) || []), file]);
  }
  return [...grouped.values()].map(group => {
    const ordered = [...group].sort((left, right) => layerOrder[left.area] - layerOrder[right.area]);
    const first = ordered[0], last = ordered[ordered.length - 1];
    const before = first.previousContent || '';
    let after = first.content;
    for (const layer of ordered.slice(1)) {
      // The example unstaged layer can cover a fragment of the staged file; preserve its other lines.
      const previous = layer.previousContent || '';
      after = previous && after.includes(previous) ? after.replace(previous, layer.content) : layer.content;
    }
    const oldLines = lines(before), newLines = lines(after);
    let prefix = 0, suffix = 0;
    while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
    while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix += 1;
    const removed = oldLines.slice(prefix, oldLines.length - suffix), added = newLines.slice(prefix, newLines.length - suffix);
    const status = first.kind === 'untracked' ? 'untracked' : !newLines.length ? 'deleted' : !oldLines.length ? 'added' : last.status;
    const previousPath = first.previousPath || last.previousPath;
    const preview = [
      `diff --git a/${previousPath || first.path} b/${first.path}`,
      `--- ${oldLines.length ? 'a/' + (previousPath || first.path) : '/dev/null'}`,
      `+++ ${newLines.length ? 'b/' + first.path : '/dev/null'}`,
      `@@ -${oldLines.length ? 1 : 0},${oldLines.length} +${newLines.length ? 1 : 0},${newLines.length} @@`,
      ...oldLines.slice(0, prefix).map(line => ' ' + line),
      ...removed.map(line => '-' + line), ...added.map(line => '+' + line),
      ...oldLines.slice(oldLines.length - suffix).map(line => ' ' + line),
    ].join('\n') + '\n';
    return { ...last, repositoryId: first.repositoryId, path: first.path, kind: first.kind, previousPath, status,
      previousContent: before, content: after, additions: added.length, deletions: removed.length, preview, previewTruncated: false };
  });
}

function taskRepositories(taskId: string): PreviewRepository[] {
  return sourceControlRepositories.flatMap(repository => {
    const commits = repository.commits.filter(commit => commit.taskId === taskId);
    const currentTask = taskId === sourceControlTaskId && repository.id === 'buildr';
    const changes = currentTask ? mergeTaskChanges(repository.taskChanges || []) : [];
    if (!currentTask && !commits.length) return [];
    return [{ changes, commits, rail: {
      id: repository.id, label: repository.name,
      root: currentTask ? repository.taskLocation || repository.location : repository.location,
      branch: currentTask ? repository.taskBranch || repository.branch : repository.branch,
      ahead: repository.ahead, status: repository.status === 'offline' ? 'unavailable' as const : 'complete' as const,
      changes, commits: commits.map(commit => ({ key: taskCommitKey(commit), commit, files: commit.files })),
    } }];
  });
}

export function taskChangeCount(taskId: string): number {
  return taskRepositories(taskId).reduce((count, repository) => count + repository.changes.length, 0);
}

export function taskCurrentFile(taskId: string, repositoryId: string, path: string): SourceControlChange | undefined {
  const taskFile = taskRepositories(taskId).find(item => item.rail.id === repositoryId)?.changes.find(file => file.path === path);
  if (taskFile) return taskFile;
  const repository = sourceControlRepositories.find(item => item.id === repositoryId);
  return mergeTaskChanges(repository?.changes || []).find(file => file.path === path);
}

/** Preserve the formal task reader and its commit/file selection without calling real task APIs. */
export function TaskChangesPreview({ taskId, onOpenFile }: Props) {
  const scope = useMemo(() => taskRepositories(taskId), [taskId]);
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  useEffect(() => { setSelected(undefined); }, [taskId]);
  const firstFile = scope.flatMap(repository => repository.changes)[0];
  const effective = selected === undefined ? firstFile ? changedFileKey(firstFile) : null : selected;
  return <TaskDiffReader key={taskId} repositories={scope.map(repository => repository.rail)}
    selected={effective} onSelect={setSelected} notice="本任务相关变更与提交 · 原型示例"
    onOpenFile={(file, repository, commit) => {
      const source = scope.find(item => item.rail.id === repository.id);
      const files = commit ? source?.commits.find(item => item.hash === commit.commit.hash)?.files : source?.changes;
      const complete = files?.find(item => changedFileKey(item) === changedFileKey(file));
      if (complete) onOpenFile(complete, repository, commit);
    }} />;
}
