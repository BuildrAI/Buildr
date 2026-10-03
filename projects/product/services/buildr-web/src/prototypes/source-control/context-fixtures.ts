import type { TaskRecord } from '../../../build/generated/task-dto';
import type { WorkbenchTaskItem, TaskWorkContext } from '../../../build/generated/workbench-dto';

export const taskRecord: TaskRecord = {
  schemaVersion: 'buildr.task-record/v4', taskId: 'code-source-control',
  title: '实现源代码管理与任务变更、提交关联',
  intent: '查看所有代码库的改动与提交历史，并从任务定位对应变更和历史内容。',
  brief: null, scope: { projects: ['product'], services: [{ project: 'product', service: 'buildr' }, { project: 'product', service: 'buildr-web' }] },
  changes: [], parentTaskId: 'code-workspace', retrospective: null, status: 'active', result: null,
  createdAt: '2026-10-01T17:09:00.448Z', updatedAt: '2026-10-02T09:10:00.000Z',
};
export const parentRecord: TaskRecord = {
  ...taskRecord, taskId: 'code-workspace', title: '建设代码板块与代码查看能力',
  intent: '随时查看全部代码库的文件、改动与提交历史，并从任务定位相关内容。', parentTaskId: null, isParent: true,
};
export const taskContext: TaskWorkContext = {
  progress: '资源管理器已交付，正在评审源代码管理的布局和任务关联。',
  nextStep: '查看各代码库的未提交变更、历史提交及任务往返。',
  updatedAt: taskRecord.updatedAt, stage: 'design', attention: null,
};
export const parentItem: WorkbenchTaskItem = {
  task: { record: parentRecord, recordDigest: 'prototype-parent', referenceDiagnostics: [],
    taskRelations: { parent: null, children: [
      { taskId: 'code-workspace-explorer', title: '建立代码板块、资源管理器与任务文件关联', status: 'completed' },
      { taskId: 'code-source-control', title: taskRecord.title, status: 'active' },
    ] }, retrospectiveDocument: { path: '', registered: null },
  },
  workContext: { schemaVersion: 'buildr.task-work-context/v1', taskId: 'code-workspace', contextDigest: 'prototype-progress', context: taskContext },
};
