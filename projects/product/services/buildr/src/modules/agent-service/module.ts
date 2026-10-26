import { createAgentService } from '@buildr-ai/buildr-agent';
import type { AgentService } from '@buildr-ai/buildr-agent';
import { WORKSPACE_APPLICATION } from '../workspace/module.ts';
import { TASK_QUERY_APPLICATION } from '../task/module.ts';
import { createAgentServiceHttpContribution } from './interfaces/http/agent-service-http.ts';

export const AGENT_SERVICE_APPLICATION = 'agent-service.application';

export function createAgentServiceModule(options: { readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string } }) {
  return {
    id: 'agent-service', requires: [WORKSPACE_APPLICATION, TASK_QUERY_APPLICATION],
    create(requires: Record<string, any>) {
      let service: AgentService | undefined;
      const resolve = () => {
        service ??= createAgentService({
          dataRoot: options.resolveWebProfile(options.readProductIdentity()).dataRoot,
          resolveWorkspace: id => requires[WORKSPACE_APPLICATION].resolveRegisteredWorkspace(id),
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
      const close = async () => { await service?.close(); };
      return { provides: { [AGENT_SERVICE_APPLICATION]: { close, generate: (input: Parameters<AgentService['models']['generate']>[0]) => resolve().models.generate(input) } }, contributions: { http: [createAgentServiceHttpContribution(resolve)] }, lifecycle: { start: async () => {}, stop: close } };
    },
  };
}
