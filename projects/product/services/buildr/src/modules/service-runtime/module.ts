import path from 'node:path';
import fs from 'node:fs';
import { CODE_APPLICATION } from '../code/module.ts';
import { TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../task/module.ts';
import { createServiceTaskRuntimeApplication, runtimeTaskAllowsService } from './application/service-task-runtime-application.ts';
import { WORKSPACE_APPLICATION } from '../workspace/module.ts';
import { createServiceRuntimeApplication } from './application/service-runtime-application.ts';
import { createServiceRuntimeView } from './application/service-runtime-view.ts';
import { ServiceRuntimeError } from './domain/errors.ts';
import type { ServiceWorktree } from './domain/worktrees.ts';
import { createServiceRuntimeCliContributions } from './interfaces/cli/service-runtime-cli.ts';
import { createServiceRuntimeHttp } from './interfaces/http/service-runtime-http.ts';
import { matchesTaskCheckout, type TaskCheckoutEvidence } from './infrastructure/task-worktree-association.ts';

export const SERVICE_RUNTIME_MODULE_ID = 'service-runtime';
export const SERVICE_RUNTIME_APPLICATION = 'service-runtime.application';
export const SERVICE_TASK_RUNTIME_APPLICATION = 'service-runtime.task-application';
export const SERVICE_RUNTIME_VIEW = 'service-runtime.view';

export const SERVICE_RUNTIME_MODULE = Object.freeze({
    id: SERVICE_RUNTIME_MODULE_ID,
    requires: [WORKSPACE_APPLICATION, CODE_APPLICATION, TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER],
    create: (requires: Record<string, any>) => {
      const workspace = requires[WORKSPACE_APPLICATION];
      const code = requires[CODE_APPLICATION];
      const worktreeProvider = requires[TASK_WORKTREE_PROVIDER] as { readGitWorktreeEvidence(root: string, taskId: string, options: { optional: boolean }): { evidence: { repositories: TaskCheckoutEvidence[] } } | null };

      function listServices(targetRoot: string) {
        const catalog = workspace.assetCatalog(targetRoot);
        return (catalog.services as any[]).map(service => {
          const repository = (catalog.repositories as any[]).find(item => item.id === service.repositoryId) ?? null;
          return {
            id: service.id as string,
            code: service.code as string,
            name: service.name as string,
            type: (service.type as string) || 'service',
            modulePath: (service.modulePath as string) || '',
            repositoryId: repository?.id ?? null,
            projects: (catalog.projects as any[]).filter(project => project.serviceIds?.includes(service.id)).map(project => project.code as string),
          };
        });
      }

      const resolveService = (targetRoot: string, serviceCode: string) => listServices(targetRoot).find(service => service.code === serviceCode) ?? null;

      function listWorktrees(targetRoot: string, serviceCode: string, taskId?: string): ServiceWorktree[] {
        const service = resolveService(targetRoot, serviceCode);
        if (!service) throw new ServiceRuntimeError('service_runtime_service_unknown', `服务未登记：${serviceCode}`);
        if (!service.repositoryId) throw new ServiceRuntimeError('service_runtime_repository_unregistered', `服务 ${serviceCode} 未登记代码库，无法确定检出目录。`);
        const observed = code.sourceControl(targetRoot, { repositoryId: service.repositoryId });
        const repository = (observed.repositories as any[]).find(item => item.id === service.repositoryId);
        if (!repository?.available) throw new ServiceRuntimeError('service_runtime_repository_unavailable', `代码库本机目录或 Git 身份当前不可读取：${repository?.code ?? service.repositoryId}`);
        const task = taskId ? readTaskScope(targetRoot, taskId) : null;
        if (task && !runtimeTaskAllowsService(task, service)) throw new ServiceRuntimeError('service_runtime_task_scope_mismatch', '所选服务不在当前任务范围。');
        // 明确任务的读取只消费该任务的提供者证据，不要求其他项目全部可读。
        const evidence = taskId ? worktreeProvider.readGitWorktreeEvidence(targetRoot, taskId, { optional: true }) : null;
        return (repository.worktrees as any[])
          .filter(worktree => worktree.available)
          .flatMap(worktree => {
            // 某个旧分支可能没有该模块；只排除该检出，不阻塞其他有效目录。
            try {
              const checkout = fs.realpathSync(worktree.location as string);
              const directory = fs.realpathSync(path.resolve(checkout, service.modulePath));
              const relative = path.relative(checkout, directory);
              if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !fs.statSync(directory).isDirectory()) return [];
              if (taskId && (worktree.taskId && worktree.taskId !== taskId || !evidence?.evidence.repositories.some(recorded => matchesTaskCheckout(repository.location, worktree, recorded)))) return [];
              return [{
                id: worktree.worktreeId as string,
                path: directory,
                label: worktree.isMain ? '主工作库' : (worktree.name as string),
                main: Boolean(worktree.isMain),
                branch: (worktree.branch as string | null) ?? null,
                head: (worktree.head as string | null) ?? null,
                dirty: typeof worktree.fileCount === 'number' ? worktree.fileCount > 0 : null,
                taskId: task?.taskId ?? (worktree.taskId as string | null) ?? null,
                taskTitle: task?.title ?? (worktree.taskTitle as string | null) ?? null,
              }];
            } catch { return []; }
          });
      }

      const taskQuery = requires[TASK_QUERY_APPLICATION] as { inspectTaskSummaryView(root: string, taskId: string): { record: { taskId: string; title: string; scope: { projects: string[]; services: Array<{ project: string; service: string }> } } } };
      const readTaskScope = (root: string, taskId: string) => {
          try {
            const { record } = taskQuery.inspectTaskSummaryView(root, taskId);
            return { taskId: record.taskId, title: record.title, scope: record.scope };
          }
          catch (cause) { throw new ServiceRuntimeError('service_runtime_task_unknown', `任务当前不可读取：${(cause as Error).message}`); }
      };
      const runtime = createServiceRuntimeApplication({ resolveService, listWorktrees,
        assertTaskScope(root, taskId, serviceCode) {
          const service = resolveService(root, serviceCode);
          if (!service || !runtimeTaskAllowsService(readTaskScope(root, taskId), service)) throw new ServiceRuntimeError('service_runtime_task_scope_mismatch', '任务服务范围已变化，请刷新后重选。');
        },
      });
      const view = createServiceRuntimeView({ catalog: { listServices }, runtime });
      const taskRuntime = createServiceTaskRuntimeApplication({
        runtime, view, catalog: { listServices }, readTaskScope,
      });

      return Object.freeze({
        provides: {
          [SERVICE_RUNTIME_APPLICATION]: runtime,
          [SERVICE_RUNTIME_VIEW]: view,
          [SERVICE_TASK_RUNTIME_APPLICATION]: taskRuntime,
        },
        contributions: {
          http: [createServiceRuntimeHttp({ view, runtime, taskRuntime })],
          cli: createServiceRuntimeCliContributions({ view, runtime, taskRuntime }),
        },
      });
    },
});
