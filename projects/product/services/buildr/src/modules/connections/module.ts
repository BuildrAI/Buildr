import { WORKSPACE_APPLICATION, WORKSPACE_QUERY, WORKSPACE_TASK_SUPPORT } from '../workspace/module.ts';
import { ConnectionsApplication } from './application/connections-application.ts';
import { resolveConnectionWorkspace } from './infrastructure/connection-workspace.ts';
import { createConnectionsCliContributions } from './interfaces/cli/connections-cli.ts';
import { createConnectionsHttpContribution } from './interfaces/http/connections-http.ts';
import { connectionFailure } from './domain/connection.ts';

export const CONNECTIONS_APPLICATION = 'connections.application';
export { resolveConnectionWorkspace } from './infrastructure/connection-workspace.ts';
export function createConnectionsModule(options: { readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string }; readPreviewCredentials?(identity: unknown): { dataRoot: string; workspaceRoot: string; workspaceId: string } | null }) {
  return Object.freeze({ id: 'connections', requires: [WORKSPACE_APPLICATION, WORKSPACE_QUERY, WORKSPACE_TASK_SUPPORT], create(requires: Record<string, any>) {
    const query = requires[WORKSPACE_QUERY], registry = requires[WORKSPACE_APPLICATION];
    const workspace = { getWorkspace: query.getWorkspace, resolveSourceWorkspaceRoot: query.resolveSourceWorkspaceRoot, listRegisteredWorkspaces: registry.listRegisteredWorkspaces };
    const store = requires[WORKSPACE_TASK_SUPPORT];
    const identity = options.readProductIdentity(), profile = options.resolveWebProfile(identity), preview = options.readPreviewCredentials?.(identity);
    const application = new ConnectionsApplication({ dataRoot: profile.dataRoot, store: { runWorkspaceSqliteRead: store.runWorkspaceSqliteRead, runWorkspaceTransaction: store.runWorkspaceTransaction }, resolveScope: root => {
      // Recheck the managed preview record and workspace identity before every operation.
      if (preview && JSON.stringify(options.readPreviewCredentials?.(identity)) !== JSON.stringify(preview)) throw connectionFailure('connection_preview_scope_mismatch', '预览认证来源已变化，请重新启动预览。', 409);
      return resolveConnectionWorkspace(root, workspace);
    }, ...(preview ? { credentialDataRoot: preview.dataRoot, readonlyScope: { rootPath: preview.workspaceRoot, workspaceId: preview.workspaceId } } : {}) });
    return Object.freeze({ provides: { [CONNECTIONS_APPLICATION]: application }, contributions: { cli: createConnectionsCliContributions(application), http: [createConnectionsHttpContribution(application)] } });
  } });
}
