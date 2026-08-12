CREATE TABLE task_parent_relations (
  child_task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  parent_task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  CHECK (child_task_id <> parent_task_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX task_parent_relations_parent_idx ON task_parent_relations(parent_task_id, child_task_id);
