CREATE TABLE task_retrospective_current (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  result_json TEXT NOT NULL CHECK (json_valid(result_json))
) STRICT, WITHOUT ROWID;
