import type { QueryPreferences } from './query-types';

/** Display choices are preferences, never an account permission boundary. */
export function databasePreferenceView(preferences: QueryPreferences | null, accessible: string[]) {
  const enabledDatabases = preferences?.enabledDatabases.filter(value => accessible.includes(value)) ?? [];
  const currentDatabase = preferences?.currentDatabase && enabledDatabases.includes(preferences.currentDatabase) ? preferences.currentDatabase : null;
  return { enabledDatabases, currentDatabase };
}
