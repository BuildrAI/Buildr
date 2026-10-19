import { AGENT_ASSETS_SOURCE_READ, AGENT_ASSETS_CONNECTION_IMPACT_BINDER } from '../agent-assets/module.ts';
import { WORKSPACE_APPLICATION, WORKSPACE_QUERY, WORKSPACE_TASK_SUPPORT } from '../workspace/module.ts';
import { retireLegacyConnections } from './persistence/retired-connections.ts';
import { resolveConnectionSkillWorkspace } from './infrastructure/workspace.ts';
import { createConnectionCatalog } from './application/catalog.ts';
import { ConnectionSkillsApplication } from './application/connection-skills-application.ts';
import { createConnectionSkillsCli } from './interfaces/cli/connection-skills-cli.ts';
import { createConnectionSkillsHttp } from './interfaces/http/connection-skills-http.ts';
export const CONNECTION_SKILLS_APPLICATION = 'connection-skills.application';
export function createConnectionSkillsModule(options: { readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string } }) {
  return Object.freeze({ id: 'connection-skills', requires: [WORKSPACE_APPLICATION, WORKSPACE_QUERY, WORKSPACE_TASK_SUPPORT, AGENT_ASSETS_SOURCE_READ, AGENT_ASSETS_CONNECTION_IMPACT_BINDER], create(requires: Record<string, any>) {
    const query = requires[WORKSPACE_QUERY], registry = requires[WORKSPACE_APPLICATION];
    const workspace = { getWorkspace: query.getWorkspace, resolveSourceWorkspaceRoot: query.resolveSourceWorkspaceRoot, listRegisteredWorkspaces: registry.listRegisteredWorkspaces };
    const dataRoot = options.resolveWebProfile(options.readProductIdentity()).dataRoot;
    const application = new ConnectionSkillsApplication({ dataRoot, catalog: createConnectionCatalog({ assets: requires[AGENT_ASSETS_SOURCE_READ] }), resolveScope: root => resolveConnectionSkillWorkspace(root, workspace), retire: scope => retireLegacyConnections(scope, dataRoot, requires[WORKSPACE_TASK_SUPPORT]) });
    requires[AGENT_ASSETS_CONNECTION_IMPACT_BINDER].bindConnectionImpacts((root: string, assetIdentity: string) => application.impacts(root, assetIdentity));
    return Object.freeze({ provides: { [CONNECTION_SKILLS_APPLICATION]: application }, lifecycle: { start() {}, stop() { application.close(); } }, contributions: { cli: createConnectionSkillsCli(application), http: [createConnectionSkillsHttp(application)] } });
  } });
}
