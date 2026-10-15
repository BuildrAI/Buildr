import { CONNECTION_SKILLS_APPLICATION } from '../connection-skills/module.ts';
import { WORKSPACE_TASK_SUPPORT } from '../workspace/module.ts';
import { MySqlQueryApplication, type MySqlConnectionAccess } from './application/mysql-query-application.ts';
import { createMySqlQueryHttp } from './interfaces/http/mysql-query-http.ts';
import { createMySqlQueryCli } from './interfaces/cli/mysql-query-cli.ts';

export const MYSQL_QUERY_APPLICATION = 'mysql-query.application';
export function createMySqlQueryModule() {
  return Object.freeze({ id: 'mysql-query', requires: [CONNECTION_SKILLS_APPLICATION, WORKSPACE_TASK_SUPPORT], create(requires: Record<string, any>) {
    const connections = requires[CONNECTION_SKILLS_APPLICATION] as { useSelected: MySqlConnectionAccess };
    const store = requires[WORKSPACE_TASK_SUPPORT];
    const application = new MySqlQueryApplication({ store: { runWorkspaceSqliteRead: store.runWorkspaceSqliteRead, runWorkspaceTransaction: store.runWorkspaceTransaction }, useConnection: (root, selection, consume) => connections.useSelected(root, selection, consume) });
    return Object.freeze({ provides: { [MYSQL_QUERY_APPLICATION]: application }, contributions: { http: [createMySqlQueryHttp(application)], cli: createMySqlQueryCli(application) } });
  } });
}
