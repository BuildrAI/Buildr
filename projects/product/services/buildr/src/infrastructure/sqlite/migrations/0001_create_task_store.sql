CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY CHECK (
    length(task_id) > 0
    AND task_id NOT GLOB '*[^a-z0-9._-]*'
    AND substr(task_id, 1, 1) GLOB '[a-z0-9]'
    AND substr(task_id, -1, 1) GLOB '[a-z0-9]'
  ),
  schema_version TEXT NOT NULL CHECK (schema_version = 'buildr.task-record/v1'),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  intent TEXT NOT NULL CHECK (length(trim(intent)) > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
  result_summary TEXT,
  result_no_change INTEGER CHECK (result_no_change IN (0, 1)),
  created_at TEXT NOT NULL CHECK (datetime(created_at) IS NOT NULL),
  updated_at TEXT NOT NULL CHECK (datetime(updated_at) IS NOT NULL AND updated_at >= created_at),
  CHECK (
    (status = 'active' AND result_summary IS NULL AND result_no_change IS NULL)
    OR (status = 'completed' AND length(trim(result_summary)) > 0 AND result_no_change IS NOT NULL)
    OR (status = 'abandoned' AND length(trim(result_summary)) > 0 AND result_no_change IS NULL)
  )
) STRICT;

CREATE TABLE task_projects (
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  project TEXT NOT NULL CHECK (length(project) > 0 AND project NOT GLOB '*[^A-Za-z0-9._-]*' AND substr(project, 1, 1) GLOB '[A-Za-z0-9]'),
  PRIMARY KEY (task_id, project)
) STRICT, WITHOUT ROWID;

CREATE TABLE task_services (
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  project TEXT NOT NULL CHECK (length(project) > 0 AND project NOT GLOB '*[^A-Za-z0-9._-]*' AND substr(project, 1, 1) GLOB '[A-Za-z0-9]'),
  service TEXT NOT NULL CHECK (length(service) > 0 AND service NOT GLOB '*[^A-Za-z0-9._-]*' AND substr(service, 1, 1) GLOB '[A-Za-z0-9]'),
  PRIMARY KEY (task_id, project, service)
) STRICT, WITHOUT ROWID;

CREATE TABLE task_changes (
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  project TEXT NOT NULL CHECK (length(project) > 0 AND project NOT GLOB '*[^A-Za-z0-9._-]*' AND substr(project, 1, 1) GLOB '[A-Za-z0-9]'),
  change_name TEXT NOT NULL CHECK (length(change_name) > 0 AND change_name NOT GLOB '*[^A-Za-z0-9._-]*' AND substr(change_name, 1, 1) GLOB '[A-Za-z0-9]'),
  PRIMARY KEY (task_id, project, change_name)
) STRICT, WITHOUT ROWID;

CREATE INDEX tasks_status_updated_at_idx ON tasks(status, updated_at DESC, task_id);
CREATE INDEX tasks_updated_at_idx ON tasks(updated_at DESC, task_id);
CREATE INDEX task_projects_project_idx ON task_projects(project, task_id);
CREATE INDEX task_services_identity_idx ON task_services(project, service, task_id);
CREATE INDEX task_changes_identity_idx ON task_changes(project, change_name, task_id);
