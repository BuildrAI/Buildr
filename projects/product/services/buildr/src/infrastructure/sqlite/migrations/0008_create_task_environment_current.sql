CREATE TABLE task_environment_current (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ready', 'blocked', 'cleaned')),
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
  updated_at TEXT NOT NULL CHECK (datetime(updated_at) IS NOT NULL)
) STRICT, WITHOUT ROWID;

CREATE INDEX task_environment_current_status_idx ON task_environment_current(status, updated_at DESC, task_id);
