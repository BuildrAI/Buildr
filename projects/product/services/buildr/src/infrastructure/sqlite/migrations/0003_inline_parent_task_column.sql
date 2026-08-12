ALTER TABLE tasks ADD COLUMN parent_task_id TEXT
  REFERENCES tasks(task_id) ON DELETE SET NULL
  CHECK (parent_task_id IS NULL OR parent_task_id <> task_id);

UPDATE tasks
SET parent_task_id = (
  SELECT relation.parent_task_id
  FROM task_parent_relations AS relation
  WHERE relation.child_task_id = tasks.task_id
)
WHERE EXISTS (
  SELECT 1
  FROM task_parent_relations AS relation
  WHERE relation.child_task_id = tasks.task_id
);

DROP TABLE task_parent_relations;

CREATE INDEX tasks_parent_task_idx ON tasks(parent_task_id, task_id);
