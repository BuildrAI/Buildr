CREATE TABLE task_finish_runs (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'blocked', 'failed', 'complete', 'cleanup_pending')),
  identity_digest TEXT NOT NULL,
  run_json TEXT NOT NULL CHECK (json_valid(run_json)),
  updated_at TEXT NOT NULL,
  completed_at TEXT
) STRICT, WITHOUT ROWID;

CREATE INDEX task_finish_runs_run_idx ON task_finish_runs(run_id);

CREATE TABLE task_finish_completions (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('complete', 'cleanup_pending')),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  completed_at TEXT,
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE task_finish_target_leases (
  target_identity TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES task_finish_runs(run_id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE INDEX task_finish_target_leases_run_idx ON task_finish_target_leases(run_id);

CREATE TABLE task_finish_transient_artifacts (
  artifact_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES task_finish_runs(run_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  relative_locator TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL,
  retention_status TEXT NOT NULL CHECK (retention_status IN ('retained', 'cleanup_pending', 'cleaned')),
  cleanup_code TEXT,
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE INDEX task_finish_transient_artifacts_run_idx ON task_finish_transient_artifacts(run_id);
