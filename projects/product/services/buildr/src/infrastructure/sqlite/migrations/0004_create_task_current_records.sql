CREATE TABLE task_development_current (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  record_json TEXT NOT NULL CHECK (json_valid(record_json))
) STRICT, WITHOUT ROWID;

CREATE TABLE task_verification_current (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  result_json TEXT NOT NULL CHECK (json_valid(result_json))
) STRICT, WITHOUT ROWID;

CREATE TABLE task_review_current (
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  review_type TEXT NOT NULL CHECK (review_type IN ('planning', 'completion')),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  PRIMARY KEY (task_id, review_type)
) STRICT, WITHOUT ROWID;
