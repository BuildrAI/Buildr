-- buildr:foreign-keys-off
PRAGMA legacy_alter_table = ON;

ALTER TABLE tasks RENAME TO tasks_v1;

CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY CHECK (
    length(task_id) > 0
    AND task_id NOT GLOB '*[^a-z0-9._-]*'
    AND substr(task_id, 1, 1) GLOB '[a-z0-9]'
    AND substr(task_id, -1, 1) GLOB '[a-z0-9]'
  ),
  schema_version TEXT NOT NULL CHECK (schema_version = 'buildr.task-record/v2'),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  intent TEXT NOT NULL CHECK (length(trim(intent)) > 0),
  status TEXT NOT NULL CHECK (status IN ('todo', 'active', 'completed', 'abandoned')),
  result_summary TEXT,
  result_no_change INTEGER CHECK (result_no_change IN (0, 1)),
  created_at TEXT NOT NULL CHECK (datetime(created_at) IS NOT NULL),
  updated_at TEXT NOT NULL CHECK (datetime(updated_at) IS NOT NULL AND updated_at >= created_at),
  parent_task_id TEXT REFERENCES tasks(task_id) ON DELETE SET NULL
    CHECK (parent_task_id IS NULL OR parent_task_id <> task_id),
  CHECK (
    (status IN ('todo', 'active') AND result_summary IS NULL AND result_no_change IS NULL)
    OR (status = 'completed' AND length(trim(result_summary)) > 0 AND result_no_change IS NOT NULL)
    OR (status = 'abandoned' AND length(trim(result_summary)) > 0 AND result_no_change IS NULL)
  )
) STRICT;

INSERT INTO tasks(
  task_id, schema_version, title, intent, status, result_summary,
  result_no_change, created_at, updated_at, parent_task_id
)
SELECT
  task_id, 'buildr.task-record/v2', title, intent, status, result_summary,
  result_no_change, created_at, updated_at, parent_task_id
FROM tasks_v1;

DROP TABLE tasks_v1;

CREATE INDEX tasks_status_updated_at_idx ON tasks(status, updated_at DESC, task_id);
CREATE INDEX tasks_updated_at_idx ON tasks(updated_at DESC, task_id);
CREATE INDEX tasks_parent_task_idx ON tasks(parent_task_id, task_id);

CREATE TABLE task_retrospective_sources (
  target_task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  source_task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL CHECK (datetime(created_at) IS NOT NULL),
  PRIMARY KEY (target_task_id, source_task_id),
  CHECK (target_task_id <> source_task_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX task_retrospective_sources_source_idx
  ON task_retrospective_sources(source_task_id, target_task_id);

PRAGMA legacy_alter_table = OFF;
