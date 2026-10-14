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
    const application = new ConnectionsApplication({ dataRoot: profile.dataRoot, store: { runWorkspaceSqliteRead: store.runWorkspaceSqliteRead, runWorkspaceTransaction: store.runWorkspaceTransaction }, resolveService: (root, serviceId) => {
      if (typeof query.listProjects !== 'function' || typeof query.listServices !== 'function') throw connectionFailure('xxl_job_service_registry_unavailable', '当前入口无法读取已登记服务（Service）。', 409);
      const projects = query.listProjects(root).projects;
      if (!Array.isArray(projects)) throw connectionFailure('xxl_job_service_registry_unavailable', '项目登记不可读取，未猜测服务（Service）身份。', 409);
      let unavailable = false;
      for (const project of projects) {
        try {
          const services = query.listServices(root, project.code).services;
          if (!Array.isArray(services)) { unavailable = true; continue; }
          if (services.some((service: { id: string }) => service.id === serviceId)) return;
        } catch { unavailable = true; }
      }
      throw connectionFailure(unavailable ? 'xxl_job_service_registry_unavailable' : 'xxl_job_service_not_found', unavailable ? '部分服务登记不可读取，无法确认目标服务（Service）；请核对当前登记。' : '目标服务（Service）未登记，请先核对稳定编号。', 409);
    }, resolveScope: root => {
      // Recheck the managed preview record and workspace identity before every operation.
      if (preview && JSON.stringify(options.readPreviewCredentials?.(identity)) !== JSON.stringify(preview)) throw connectionFailure('connection_preview_scope_mismatch', '预览认证来源已变化，请重新启动预览。', 409);
      return resolveConnectionWorkspace(root, workspace);
    }, ...(preview ? { credentialDataRoot: preview.dataRoot, readonlyScope: { rootPath: preview.workspaceRoot, workspaceId: preview.workspaceId } } : {}) });
    return Object.freeze({ provides: { [CONNECTIONS_APPLICATION]: application }, contributions: { cli: createConnectionsCliContributions(application), http: [createConnectionsHttpContribution(application)] } });
  } });
}
