import type { TaskRecord, TaskCommitsResult } from '../../../build/generated/task-dto';
import type { TaskWorkContext } from '../../../build/generated/workbench-dto';
import type { TaskCommit } from '../../features/task/components/task-commit-model';

export const taskId = '2026-09-27-task-git-commits';
export const record: TaskRecord = {
  schemaVersion: 'buildr.task-record/v4', taskId, title: '任务与 Git 提交双向关联', brief: null,
  intent: '在任务中查看每次提交的说明和哈希值，在提交说明中保留任务编码，让工作目标与实际改动互相可追溯。',
  scope: { projects: ['product'], services: [{ project: 'product', service: 'buildr' }, { project: 'product', service: 'buildr-web' }] },
  changes: [], parentTaskId: null, retrospective: null, status: 'active', result: null,
  createdAt: '2026-09-27T01:00:00.000Z', updatedAt: '2026-09-27T06:40:00.000Z',
};
export const context: TaskWorkContext = {
  progress: '正在讨论任务与提交的关联方式，并查看界面原型。', nextStep: '确认关联约定和页面呈现。', updatedAt: record.updatedAt, attention: null, stage: 'design',
};
const examples = [
  { hash: 'a13c8f294d507b671e329ad704dd39128fc051b6', subject: 'fix(task): 补充提交记录的空白与失败状态', authorName: 'chenjun', committedAt: '2026-09-27 14:40', repositoryId: 'prototype-buildr', message: `fix(task): 补充提交记录的空白与失败状态\n\n区分尚无提交和暂时无法读取，保留重新读取入口。\n在窄屏中换行展示完整哈希与任务编码。\n\nBuildr-Task: ${taskId}` },
  { hash: '8e2b14ca071d5fe90aab76c933d125608e71c42d', subject: 'feat(task): 展示任务关联的提交记录', authorName: 'chenjun', committedAt: '2026-09-27 13:25', repositoryId: 'prototype-buildr', message: `feat(task): 展示任务关联的提交记录\n\n按提交时间展示主题、短哈希和作者。\n展开后查看完整提交说明，并支持复制。\n\nBuildr-Task: ${taskId}` },
  { hash: '5b90df62c146e3882ef04796a901d570f487c2aa', subject: 'docs(task): 明确任务与提交的关联约定', authorName: 'chenjun', committedAt: '2026-09-27 11:10', repositoryId: 'prototype-buildr', message: `docs(task): 明确任务与提交的关联约定\n\n一个任务可关联多次提交；一次提交通常关联一个任务。\n在提交说明末尾用 Buildr-Task 保留任务编码。\n\nBuildr-Task: ${taskId}` },
];

export const commits: TaskCommit[] = examples.map(commit => ({ ...commit, shortHash: commit.hash.slice(0, 8), authorEmail: 'example@example.com', committedAt: commit.committedAt.replace(' ', 'T') + ':00+08:00', authoredAt: commit.committedAt.replace(' ', 'T') + ':00+08:00' }));
export const commitResult: TaskCommitsResult = {
  schemaVersion: 'buildr.task-commits/v1', taskId, readAt: '2026-09-27T06:40:00Z', status: 'complete', commits,
  repositories: [{ id: 'prototype-buildr', label: 'Buildr', root: '/模拟工作空间/Buildr', sources: ['workspace'], status: 'complete', scannedCommitCount: 18 }],
  coverage: { refs: ['HEAD', '--all'], repositoryLimit: 20, historyLimitPerRepository: 10000, commitLimit: 200, truncated: false }, diagnostics: [], effects: [],
};
