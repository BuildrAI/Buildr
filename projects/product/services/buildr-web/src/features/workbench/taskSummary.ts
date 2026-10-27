import type { WorkbenchTaskItem } from '../../../build/generated/workbench-dto';

const TERMINAL_STATUSES = ['completed', 'abandoned'];

export function workbenchTaskSummary(item: WorkbenchTaskItem): string {
  const record = item.task.record;
  const progress = item.workContext.context?.progress;
  const result = record.result?.summary;
  if (TERMINAL_STATUSES.includes(record.status)) return result || record.intent;
  return progress || result || record.intent;
}
