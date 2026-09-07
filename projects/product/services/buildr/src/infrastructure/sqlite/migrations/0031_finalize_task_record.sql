-- buildr:foreign-keys-off
PRAGMA legacy_alter_table = ON;

DROP TABLE terminal_contribution_reconciliations;
ALTER TABLE tasks RENAME TO tasks_v3;

CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY CHECK (
    length(task_id) > 0
    AND task_id NOT GLOB '*[^a-z0-9._-]*'
    AND substr(task_id, 1, 1) GLOB '[a-z0-9]'
    AND substr(task_id, -1, 1) GLOB '[a-z0-9]'
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  intent TEXT NOT NULL CHECK (length(trim(intent)) > 0),
  status TEXT NOT NULL CHECK (status IN ('todo', 'active', 'completed', 'abandoned')),
  result_summary TEXT,
  created_at TEXT NOT NULL CHECK (datetime(created_at) IS NOT NULL),
  updated_at TEXT NOT NULL CHECK (datetime(updated_at) IS NOT NULL AND updated_at >= created_at),
  parent_task_id TEXT REFERENCES tasks(task_id) ON DELETE SET NULL
    CHECK (parent_task_id IS NULL OR parent_task_id <> task_id),
  is_parent INTEGER NOT NULL DEFAULT 0 CHECK (is_parent IN (0, 1)),
  parent_completion_json TEXT CHECK (parent_completion_json IS NULL OR json_valid(parent_completion_json)),
  result_history_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(result_history_json) AND json_type(result_history_json) = 'array'),
  legacy_parent_plan_json TEXT
    CHECK (legacy_parent_plan_json IS NULL OR json_valid(legacy_parent_plan_json)),
  retrospective_state TEXT CHECK (retrospective_state IN ('pending-decision', 'decided')),
  retrospective_document_digest TEXT CHECK (
    retrospective_document_digest IS NULL
    OR (
      length(retrospective_document_digest) = 71
      AND substr(retrospective_document_digest, 1, 7) = 'sha256-'
      AND substr(retrospective_document_digest, 8) NOT GLOB '*[^0-9a-f]*'
    )
  ),
  CHECK (
    (status IN ('todo', 'active') AND result_summary IS NULL)
    OR (status IN ('completed', 'abandoned') AND length(trim(result_summary)) > 0)
  ),
  CHECK (
    (retrospective_state IS NULL AND retrospective_document_digest IS NULL)
    OR (
      status IN ('completed', 'abandoned')
      AND retrospective_state IS NOT NULL
      AND retrospective_document_digest IS NOT NULL
    )
  )
) STRICT;

INSERT INTO tasks(
  task_id, title, intent, status, result_summary, created_at, updated_at,
  parent_task_id, is_parent, parent_completion_json, result_history_json,
  legacy_parent_plan_json, retrospective_state, retrospective_document_digest
)
SELECT
  task_id, title, intent, status, result_summary, created_at, updated_at,
  parent_task_id, is_parent, parent_completion_json,
  CASE
    WHEN json_array_length(result_history_json) = 0 THEN '[]'
    ELSE (SELECT json_group_array(json_remove(entry.value, '$.result.noChange')) FROM json_each(tasks_v3.result_history_json) AS entry)
  END,
  legacy_parent_plan_json, retrospective_state, retrospective_document_digest
FROM tasks_v3;

DROP TABLE tasks_v3;

CREATE INDEX tasks_status_updated_at_idx ON tasks(status, updated_at DESC, task_id);
CREATE INDEX tasks_updated_at_idx ON tasks(updated_at DESC, task_id);
CREATE INDEX tasks_parent_task_idx ON tasks(parent_task_id, task_id);
CREATE INDEX tasks_retrospective_state_idx ON tasks(retrospective_state, updated_at DESC, task_id);

PRAGMA legacy_alter_table = OFF;
