export type MySqlQueryResult = {
  connectionId: string;
  database: string | null;
  submittedSql: string;
  executedSql: string;
  columns: { name: string; type: string }[];
  rows: unknown[][];
  rowCount: number;
  rowLimit: number;
  elapsedMs: number;
  limitReached: boolean;
};

export type QueryPreferences = {
  enabledDatabases: string[];
  currentDatabase: string | null;
  revision: string;
};

export type MySqlQueryTarget = { id: string; name: string; environment: string; revision: string };
export type MySqlQueryClient = {
  databases(id: string, signal?: AbortSignal): Promise<{ connectionId: string; databases: string[] }>;
  queryPreferences(id: string, signal?: AbortSignal): Promise<QueryPreferences>;
  saveQueryPreferences(id: string, input: { enabledDatabases: string[]; currentDatabase: string | null; expectedRevision: string }, signal?: AbortSignal): Promise<QueryPreferences>;
  query(id: string, input: { sql: string; database?: string | null }, signal?: AbortSignal): Promise<MySqlQueryResult>;
};
