import fs from 'node:fs';
import { AGENT_OPERATIONS_APPLICATION, type AgentOperationsApplication } from '../agent-operations/module.ts';
import { WORKSPACE_APPLICATION, WORKSPACE_QUERY } from '../workspace/module.ts';
import { TASK_QUERY_APPLICATION } from '../task/module.ts';
import { CodexDesktopApplication } from './application/codex-desktop-application.ts';
import { createCodexDesktopHttpContribution } from './interfaces/http/codex-desktop-http.ts';
import { createCodexDesktopCliContributions } from './interfaces/cli/codex-desktop-cli.ts';
import { codexFailure } from './domain/codex-desktop.ts';

export const CODEX_DESKTOP_APPLICATION = 'codex-desktop.application';
export function createCodexDesktopModule(options: { readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string }; readOrigin(profile: { dataRoot: string }): string | null }) {
  return Object.freeze({
    id: 'codex-desktop', requires: Object.freeze([AGENT_OPERATIONS_APPLICATION, WORKSPACE_APPLICATION, WORKSPACE_QUERY, TASK_QUERY_APPLICATION]),
    create(requires: Record<string, any>) {
      const profile = options.resolveWebProfile(options.readProductIdentity());
      const workspace = requires[WORKSPACE_APPLICATION], query = requires[WORKSPACE_QUERY], tasks = requires[TASK_QUERY_APPLICATION];
      const application = new CodexDesktopApplication({
        dataRoot: profile.dataRoot,
        resolveWorkspace: id => {
          const current = workspace.resolveRegisteredWorkspace(id, { touch: false });
          return { rootPath: current.rootPath, workspace: current.workspace.workspace };
        },
        readTaskIdentity: (root, id) => {
          const current = tasks.inspectTaskSummaryView(root, id);
          return { taskId: current.record.taskId, title: current.record.title, revision: current.recordDigest };
        },
        readOrigin: () => options.readOrigin(profile),
        readRegistrationActive: agentId => (requires[AGENT_OPERATIONS_APPLICATION] as AgentOperationsApplication).hasCodexRegistration(agentId),
      });
      (requires[AGENT_OPERATIONS_APPLICATION] as AgentOperationsApplication).bindCodexDesktopConnector(application);
      const resolveWorkspaceTarget = (root: string) => {
        const current = query.getWorkspace(root);
        const registered = workspace.resolveRegisteredWorkspace(current.workspace.id, { touch: false });
        if (fs.realpathSync(current.rootPath) !== fs.realpathSync(registered.rootPath)) throw codexFailure('codex_workspace_target_changed', '目标目录不是当前已登记工作空间，未建立聊天关联。', 409);
        return current.workspace.id;
      };
      return Object.freeze({ provides: { [CODEX_DESKTOP_APPLICATION]: application }, contributions: { http: [createCodexDesktopHttpContribution(application, root => query.getWorkspace(root).workspace.id)], cli: createCodexDesktopCliContributions(application, resolveWorkspaceTarget) } });
    },
  });
}
