import { WORKSPACE_APPLICATION, WORKSPACE_QUERY } from '../workspace/module.ts';
import { ConnectionsApplication } from './application/connections-application.ts';
import { resolveConnectionWorkspace } from './infrastructure/connection-workspace.ts';
import { createConnectionsCliContributions } from './interfaces/cli/connections-cli.ts';
import { createConnectionsHttpContribution } from './interfaces/http/connections-http.ts';

export const CONNECTIONS_APPLICATION = 'connections.application';
export function createConnectionsModule(options: { readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string } }) {
  return Object.freeze({ id: 'connections', requires: [WORKSPACE_APPLICATION, WORKSPACE_QUERY], create(requires: Record<string, any>) {
    const query = requires[WORKSPACE_QUERY], registry = requires[WORKSPACE_APPLICATION];
    const workspace = { getWorkspace: query.getWorkspace, resolveSourceWorkspaceRoot: query.resolveSourceWorkspaceRoot, listRegisteredWorkspaces: registry.listRegisteredWorkspaces };
    const profile = options.resolveWebProfile(options.readProductIdentity());
    const application = new ConnectionsApplication({ dataRoot: profile.dataRoot, resolveScope: root => resolveConnectionWorkspace(root, workspace) });
    return Object.freeze({ provides: { [CONNECTIONS_APPLICATION]: application }, contributions: { cli: createConnectionsCliContributions(application), http: [createConnectionsHttpContribution(application)] } });
  } });
}
