ALTER TABLE tasks ADD COLUMN is_parent INTEGER NOT NULL DEFAULT 0 CHECK (is_parent IN (0, 1));
ALTER TABLE tasks ADD COLUMN parent_completion_json TEXT CHECK (parent_completion_json IS NULL OR json_valid(parent_completion_json));

-- Preserve an observed coordination role, never infer completion or authorization.
UPDATE tasks SET is_parent = 1 WHERE task_id IN (SELECT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL);
UPDATE tasks SET is_parent = 1 WHERE task_id IN (
  SELECT task_id FROM task_development_current
  WHERE CASE WHEN json_valid(record_json) THEN json_type(record_json, '$.parentPlan') = 'object' ELSE 0 END
);
