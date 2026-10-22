import path from 'node:path';
import { defineModule } from '../../bootstrap/module-registry.ts';
import { CODE_APPLICATION } from '../code/module.ts';
import { CONNECTION_SKILLS_APPLICATION } from '../connection-skills/module.ts';
import { WORKSPACE_APPLICATION } from '../workspace/module.ts';
import { createServiceDeploymentApplication } from './application/service-deployment-application.ts';
import { createServiceRuntimeApplication } from './application/service-runtime-application.ts';
import { createServiceRuntimeView } from './application/service-runtime-view.ts';
import { ServiceRuntimeError } from './domain/errors.ts';
import type { ServiceWorktree } from './domain/worktrees.ts';
import { createServiceRuntimeCliContributions } from './interfaces/cli/service-runtime-cli.ts';
import { createServiceRuntimeHttp } from './interfaces/http/service-runtime-http.ts';

export const SERVICE_RUNTIME_MODULE_ID = 'service-runtime';
export const SERVICE_RUNTIME_APPLICATION = 'service-runtime.application';
export const SERVICE_DEPLOYMENT_APPLICATION = 'service-runtime.deployment';
export const SERVICE_RUNTIME_VIEW = 'service-runtime.view';

export const SERVICE_RUNTIME_MODULE = Object.freeze(
  defineModule({
    id: SERVICE_RUNTIME_MODULE_ID,
    requires: [WORKSPACE_APPLICATION, CODE_APPLICATION, CONNECTION_SKILLS_APPLICATION],
    create: (requires: Record<string, any>) => {
      const workspace = requires[WORKSPACE_APPLICATION];
      const code = requires[CODE_APPLICATION];
      const connectionSkills = requires[CONNECTION_SKILLS_APPLICATION];

      function listServices(targetRoot: string) {
        const catalog = workspace.assetCatalog(targetRoot);
        return (catalog.services as any[]).map(service => {
          const repository = (catalog.repositories as any[]).find(item => item.id === service.repositoryId) ?? null;
          return {
            id: service.id as string,
            code: service.code as string,
            name: service.name as string,
            modulePath: (service.modulePath as string) || '',
            repositoryId: repository?.id ?? null,
            projects: (catalog.projects as any[]).filter(project => project.serviceIds?.includes(service.id)).map(project => project.code as string),
          };
        });
      }

      const resolveService = (targetRoot: string, serviceCode: string) => listServices(targetRoot).find(service => service.code === serviceCode) ?? null;

      function listWorktrees(targetRoot: string, serviceCode: string): ServiceWorktree[] {
        const service = resolveService(targetRoot, serviceCode);
        if (!service) throw new ServiceRuntimeError('service_runtime_service_unknown', `服务未登记：${serviceCode}`);
        if (!service.repositoryId) throw new ServiceRuntimeError('service_runtime_repository_unregistered', `服务 ${serviceCode} 未登记代码库，无法确定检出目录。`);
        const observed = code.sourceControl(targetRoot, { repositoryId: service.repositoryId });
        const repository = (observed.repositories as any[]).find(item => item.id === service.repositoryId);
        if (!repository?.available) throw new ServiceRuntimeError('service_runtime_repository_unavailable', `代码库本机目录或 Git 身份当前不可读取：${repository?.code ?? service.repositoryId}`);
        return (repository.worktrees as any[])
          .filter(worktree => worktree.available)
          .map(worktree => ({
            id: worktree.worktreeId as string,
            path: path.join(worktree.location as string, service.modulePath),
            label: worktree.isMain ? '主检出' : (worktree.name as string),
            main: Boolean(worktree.isMain),
            branch: (worktree.branch as string | null) ?? null,
            head: (worktree.head as string | null) ?? null,
            dirty: (worktree.fileCount as number | null) !== null && (worktree.fileCount as number) > 0,
            taskId: (worktree.taskId as string | null) ?? null,
            taskTitle: (worktree.taskTitle as string | null) ?? null,
          }));
      }

      const runtime = createServiceRuntimeApplication({ resolveService, listWorktrees });
      const deployment = createServiceDeploymentApplication({
        resolveService,
        listWorktrees,
        connection: {
          describe(targetRoot: string, connectionId: string, program: string) {
            const instance = connectionSkills.get(targetRoot, connectionId).instance;
            const diagnostics = [...(instance.availability?.diagnostics ?? [])];
            const availability = instance.programAvailability?.[program];
            if (availability && availability.ready === false) diagnostics.push(`部署程序 ${program} 未就绪。`);
            for (const item of availability?.diagnostics ?? []) diagnostics.push(`部署程序 ${program}：${item}`);
            return { id: instance.id as string, name: instance.name as string, revision: instance.revision as string, diagnostic: diagnostics.length ? [...new Set(diagnostics)].join(' ') : null };
          },
          run: (targetRoot: string, options: { connection: { id: string; revision: string }; program: string; args: string[]; input: string; timeoutMs: number }) => connectionSkills.run(targetRoot, {
            id: options.connection.id,
            expectedRevision: options.connection.revision,
            program: options.program,
            args: options.args,
            input: options.input,
            timeoutMs: options.timeoutMs,
          }),
        },
      });
      const view = createServiceRuntimeView({ catalog: { listServices }, runtime, deployment });

      return Object.freeze({
        provides: {
          [SERVICE_RUNTIME_APPLICATION]: runtime,
          [SERVICE_DEPLOYMENT_APPLICATION]: deployment,
          [SERVICE_RUNTIME_VIEW]: view,
        },
        contributions: {
          http: [createServiceRuntimeHttp({ view, runtime, deployment })],
          cli: createServiceRuntimeCliContributions({ view, runtime, deployment }),
        },
      });
    },
  }),
);
