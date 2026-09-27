import { useState } from 'react';
import { useTaskCommits } from '../hooks/useTaskCommits';
import { TaskCommitRecords } from './TaskCommitRecords';

export function TaskCommitsPane({ taskId, refreshToken }: { taskId: string; refreshToken: number }) {
  const commits = useTaskCommits(taskId, refreshToken);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exampleOpen, setExampleOpen] = useState(false);
  return <TaskCommitRecords taskId={taskId} data={commits.data} loading={commits.loading} error={commits.error} expanded={expanded} exampleOpen={exampleOpen} onExpand={setExpanded} onExample={setExampleOpen} onRetry={commits.retry} />;
}
