CREATE TABLE task_review_history (
  id INTEGER PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  review_type TEXT NOT NULL CHECK (review_type IN ('planning', 'completion')),
  result_json TEXT NOT NULL CHECK (json_valid(result_json))
) STRICT;
CREATE INDEX task_review_history_task_idx ON task_review_history(task_id, review_type, id);
