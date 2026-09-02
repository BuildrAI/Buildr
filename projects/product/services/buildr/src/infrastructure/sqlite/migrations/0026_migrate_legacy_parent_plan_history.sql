ALTER TABLE tasks ADD COLUMN legacy_parent_plan_json TEXT
  CHECK (legacy_parent_plan_json IS NULL OR json_valid(legacy_parent_plan_json));

CREATE TEMP TABLE _buildr_parent_plan_history_assertion (
  valid INTEGER NOT NULL CHECK (valid = 1)
) STRICT;

INSERT INTO _buildr_parent_plan_history_assertion(valid)
SELECT 0
FROM task_development_current
WHERE json_type(record_json, '$.parentPlan') IS NOT NULL
  AND json_type(record_json, '$.parentPlan') <> 'object';

UPDATE tasks
SET legacy_parent_plan_json = (
  SELECT json_extract(development.record_json, '$.parentPlan')
  FROM task_development_current AS development
  WHERE development.task_id = tasks.task_id
)
WHERE EXISTS (
  SELECT 1
  FROM task_development_current AS development
  WHERE development.task_id = tasks.task_id
    AND json_type(development.record_json, '$.parentPlan') = 'object'
);

INSERT INTO _buildr_parent_plan_history_assertion(valid)
SELECT 0
FROM task_development_current AS development
JOIN tasks AS task ON task.task_id = development.task_id
WHERE json_type(development.record_json, '$.parentPlan') = 'object'
  AND (
    task.legacy_parent_plan_json IS NULL
    OR json(task.legacy_parent_plan_json) <> json(json_extract(development.record_json, '$.parentPlan'))
  );

DROP TABLE _buildr_parent_plan_history_assertion;
