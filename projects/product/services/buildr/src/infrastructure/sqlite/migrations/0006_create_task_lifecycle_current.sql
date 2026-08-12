CREATE TABLE task_lifecycle_current (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  model_json TEXT NOT NULL CHECK (json_valid(model_json))
) STRICT, WITHOUT ROWID;
