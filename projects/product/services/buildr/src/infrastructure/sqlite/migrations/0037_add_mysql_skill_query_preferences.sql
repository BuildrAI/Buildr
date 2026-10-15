CREATE TABLE mysql_skill_query_preferences (
  workspace_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  binding_key TEXT NOT NULL,
  enabled_databases_json TEXT NOT NULL CHECK (json_valid(enabled_databases_json) AND json_type(enabled_databases_json) = 'array'),
  current_database TEXT,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  PRIMARY KEY (workspace_id, instance_id, binding_key)
) STRICT;
