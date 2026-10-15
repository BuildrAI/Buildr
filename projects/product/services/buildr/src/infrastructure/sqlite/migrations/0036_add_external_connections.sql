CREATE TABLE external_connection_store (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  workspace_id TEXT NOT NULL,
  legacy_digest TEXT,
  initialized_at TEXT NOT NULL CHECK (datetime(initialized_at) IS NOT NULL)
) STRICT;
CREATE TABLE external_connections (
  connection_id TEXT PRIMARY KEY,
  record_json TEXT NOT NULL CHECK (json_valid(record_json) AND json_extract(record_json, '$.id') = connection_id)
) STRICT;
CREATE UNIQUE INDEX external_connections_credential_id_idx ON external_connections(json_extract(record_json, '$.credentialId')) WHERE json_extract(record_json, '$.credentialId') IS NOT NULL;
CREATE TABLE connection_query_preferences (
  connection_id TEXT PRIMARY KEY REFERENCES external_connections(connection_id) ON DELETE CASCADE,
  enabled_databases_json TEXT NOT NULL CHECK (json_valid(enabled_databases_json) AND json_type(enabled_databases_json) = 'array'),
  current_database TEXT,
  generation INTEGER NOT NULL CHECK (generation >= 1)
) STRICT;
