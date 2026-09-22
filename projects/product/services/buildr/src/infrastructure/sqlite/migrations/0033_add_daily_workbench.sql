CREATE TABLE task_work_context_current (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  context_json TEXT NOT NULL CHECK (json_valid(context_json)),
  attention_state TEXT CHECK (attention_state IN ('pending', 'resolved')),
  updated_at TEXT NOT NULL CHECK (datetime(updated_at) IS NOT NULL)
) STRICT;
CREATE INDEX task_work_context_attention_idx ON task_work_context_current(attention_state, updated_at DESC, task_id);
CREATE TABLE workbench_preferences (
  kind TEXT NOT NULL CHECK (kind IN ('pinned-task', 'planned-task', 'followed-project', 'saved-resource', 'recent-resource')),
  object_key TEXT NOT NULL CHECK (length(object_key) BETWEEN 1 AND 300),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  href TEXT NOT NULL CHECK (length(trim(href)) > 0),
  updated_at TEXT NOT NULL CHECK (datetime(updated_at) IS NOT NULL),
  PRIMARY KEY(kind, object_key)
) STRICT;
CREATE INDEX workbench_preferences_recent_idx ON workbench_preferences(kind, updated_at DESC, object_key);
