import type { ComponentProps } from 'react';
import { GitDiffReader } from '../../../../../buildr-harness-web/src/source-control';
import { taskApi } from '../api/task-api';
export type { RailCommit, RailRepository } from '../../../../../buildr-harness-web/src/source-control';

const loadDiff: NonNullable<ComponentProps<typeof GitDiffReader>['loadDiff']> = (taskId,input,signal) => taskApi.fileDiff(taskId,input,{signal});
export function TaskDiffReader(props: Omit<ComponentProps<typeof GitDiffReader>,'loadDiff'>) {
  return <GitDiffReader {...props} loadDiff={loadDiff} />;
}
