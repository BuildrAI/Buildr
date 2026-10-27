import fs from 'node:fs';
import { createAgentService } from '@buildr-ai/buildr-agent';
import type { AgentService } from '@buildr-ai/buildr-agent';
import { WORKSPACE_APPLICATION } from '../workspace/module.ts';
import { TASK_QUERY_APPLICATION } from '../task/module.ts';
import { defaultWorkspaceRoot } from './infrastructure/default-workspace.ts';
import { createAgentServiceHttpContribution } from './interfaces/http/agent-service-http.ts';

export const AGENT_SERVICE_APPLICATION = 'agent-service.application';

export function createAgentServiceModule(options: { readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string; profile?: string; overridden?: boolean } }) {
  return {
    id: 'agent-service', requires: [WORKSPACE_APPLICATION, TASK_QUERY_APPLICATION],
    create(requires: Record<string, any>) {
      let service: AgentService | undefined;
      const defaultWorkspace = () => {
        const rootPath = defaultWorkspaceRoot(options.resolveWebProfile(options.readProductIdentity()));
        return { rootPath: fs.existsSync(rootPath) ? fs.realpathSync(rootPath) : rootPath };
      };
      const resolve = () => {
        service ??= createAgentService({
          dataRoot: options.resolveWebProfile(options.readProductIdentity()).dataRoot,
          autoContinueInterrupted: options.resolveWebProfile(options.readProductIdentity()).profile === 'development',
          resolveWorkspace: id => {
            if (id !== '@default') return requires[WORKSPACE_APPLICATION].resolveRegisteredWorkspace(id);
            const { rootPath } = defaultWorkspace();
            fs.mkdirSync(rootPath, { recursive: true });
            return { rootPath: fs.realpathSync(rootPath) };
          },
          assertTask: (workspaceId, taskId) => {
            const workspace = requires[WORKSPACE_APPLICATION].resolveRegisteredWorkspace(workspaceId);
            const result = requires[TASK_QUERY_APPLICATION].inspectTask(workspace.rootPath, taskId);
            if (!result?.record || result.taskId !== taskId) {
              const error: Error & { code?: string; status?: number } = new Error('任务身份不可用。'); error.code = 'agent_task_missing'; error.status = 404; throw error;
            }
          },
        });
        return service;
      };
      const start = () => resolve().conversations.recoverInterrupted();
      const close = async () => { await service?.close(); };
      // 默认工作空间的对话同样落在私有交互库中，纳入全空间查询范围。
      const registeredWorkspaceIds = () => ['@default', ...requires[WORKSPACE_APPLICATION].listRegisteredWorkspaces().workspaces.filter((entry: any) => entry.workspace?.id && entry.status !== 'identity_conflict').map((entry: any) => entry.workspace.id)];
      return { provides: { [AGENT_SERVICE_APPLICATION]: { start, close, generate: (input: Parameters<AgentService['models']['generate']>[0]) => resolve().models.generate(input) } }, contributions: { http: [createAgentServiceHttpContribution(resolve, { defaultWorkspace, registeredWorkspaceIds })] }, lifecycle: { start: async () => { void start().catch(() => { console.warn('中断执行恢复检查未完成，已有工作记录保留。'); }); }, stop: close } };
    },
  };
}
