import fs from 'node:fs';
import { WORKSPACE_APPLICATION, WORKSPACE_QUERY } from '../workspace/module.ts';
import { TASK_QUERY_APPLICATION } from '../task/module.ts';
import { NativeSessionLinksApplication } from './application/native-session-links-application.ts';
import { nativeSessionFailure } from './domain/native-session-links.ts';
import { createNativeSessionLinksHttpContribution } from './interfaces/http/native-session-links-http.ts';
import { createDshSessionLinksCliContributions } from './interfaces/cli/dsh-session-links-cli.ts';

export const NATIVE_SESSION_LINKS_APPLICATION = 'native-session-links.application';
export { NativeSessionLinksApplication } from './application/native-session-links-application.ts';
export type { DshDesktopLinksPort } from './application/native-session-links-application.ts';
export function createNativeSessionLinksModule(options: { readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string }; readOrigin(profile: { dataRoot: string }): string | null }) {
  return Object.freeze({
    id: 'native-session-links', requires: Object.freeze([WORKSPACE_APPLICATION, WORKSPACE_QUERY, TASK_QUERY_APPLICATION]),
    create(requires: Record<string, any>) {
      const profile = options.resolveWebProfile(options.readProductIdentity()), workspace = requires[WORKSPACE_APPLICATION], query = requires[WORKSPACE_QUERY], tasks = requires[TASK_QUERY_APPLICATION];
      const application = new NativeSessionLinksApplication({
        resolveWorkspace: id => { const current = workspace.resolveRegisteredWorkspace(id, { touch: false }); return { rootPath: current.rootPath, workspace: current.workspace.workspace }; },
        readTaskIdentity: (root, id) => { const current = tasks.inspectTaskSummaryView(root, id); return { taskId: current.record.taskId, revision: current.recordDigest }; },
        readOrigin: () => options.readOrigin(profile),
      });
      const resolveTarget = (root: string) => {
        const current = query.getWorkspace(root), registered = workspace.resolveRegisteredWorkspace(current.workspace.id, { touch: false });
        if (fs.realpathSync(current.rootPath) !== fs.realpathSync(registered.rootPath)) throw nativeSessionFailure('dsh_workspace_target_changed', '目标目录不是当前已登记工作空间（Workspace），未建立会话（Session）关联。', 409);
        return current.workspace.id;
      };
      return Object.freeze({ provides: { [NATIVE_SESSION_LINKS_APPLICATION]: application }, contributions: { http: [createNativeSessionLinksHttpContribution(application, root => query.getWorkspace(root).workspace.id)], cli: createDshSessionLinksCliContributions(application, resolveTarget) } });
    },
  });
}
