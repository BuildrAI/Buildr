ALTER TABLE task_execution_records RENAME TO task_execution_records_before_unknown_outcome;

CREATE TABLE task_execution_records (
  record_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'buildr.task-execution-record/v1'),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  owner TEXT NOT NULL CHECK (owner IN ('task-verification', 'task-finish')),
  kind TEXT NOT NULL,
  run_identity TEXT NOT NULL CHECK (trim(run_identity) <> ''),
  invocation_identity TEXT CHECK (
    invocation_identity IS NULL
    OR (
      length(invocation_identity) = 71
      AND substr(invocation_identity, 1, 7) = 'sha256-'
      AND substr(invocation_identity, 8) NOT GLOB '*[^0-9a-f]*'
    )
  ),
  target_identity TEXT NOT NULL CHECK (trim(target_identity) <> ''),
  producer TEXT NOT NULL CHECK (trim(producer) <> ''),
  outcome TEXT NOT NULL CHECK (outcome IN ('running', 'passed', 'failed', 'blocked', 'cancelled', 'unknown')),
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('open', 'retained', 'cleanup_pending', 'cleaned', 'attention')),
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('not-required', 'pending', 'acknowledged', 'recovered')),
  body_status TEXT NOT NULL CHECK (body_status IN ('staging', 'available', 'cleaned')),
  quota_status TEXT NOT NULL CHECK (quota_status IN ('reserved', 'charged', 'released')),
  body_locator TEXT,
  body_digest TEXT,
  stored_size_bytes INTEGER NOT NULL CHECK (stored_size_bytes >= 0 AND stored_size_bytes <= 16777216),
  original_size_bytes INTEGER NOT NULL CHECK (original_size_bytes >= 0),
  truncated INTEGER NOT NULL CHECK (truncated IN (0, 1)),
  redaction_version TEXT NOT NULL CHECK (redaction_version = 'buildr.task-execution-record-redaction/v1'),
  reserved_size_bytes INTEGER NOT NULL CHECK (reserved_size_bytes IN (0, 16777216)),
  retain_until TEXT,
  opened_at TEXT NOT NULL CHECK (trim(opened_at) <> ''),
  sealed_at TEXT,
  resolved_at TEXT,
  cleanup_started_at TEXT,
  cleaned_at TEXT,
  cleanup_code TEXT,
  updated_at TEXT NOT NULL CHECK (trim(updated_at) <> ''),
  UNIQUE (task_id, owner, kind, run_identity),
  CHECK (
    (owner = 'task-verification' AND kind = 'verification-execution')
    OR (owner = 'task-finish' AND kind = 'finish-diagnostics')
  ),
  CHECK (
    (lifecycle_status = 'open'
      AND outcome = 'running'
      AND resolution_status = 'not-required'
      AND body_status = 'staging'
      AND quota_status = 'reserved'
      AND body_locator IS NULL
      AND body_digest IS NULL
      AND stored_size_bytes = 0
      AND original_size_bytes = 0
      AND truncated = 0
      AND reserved_size_bytes = 16777216
      AND retain_until IS NULL
      AND sealed_at IS NULL
      AND resolved_at IS NULL
      AND cleanup_started_at IS NULL
      AND cleaned_at IS NULL
      AND cleanup_code IS NULL)
    OR
    (lifecycle_status IN ('retained', 'attention')
      AND outcome IN ('passed', 'failed', 'blocked', 'cancelled', 'unknown')
      AND body_status = 'available'
      AND quota_status = 'charged'
      AND body_locator GLOB '.buildr/local/task-execution-records/*/*/'
      AND body_digest GLOB 'sha256-*'
      AND length(body_digest) = 71
      AND reserved_size_bytes = 0
      AND retain_until IS NOT NULL
      AND sealed_at IS NOT NULL
      AND cleanup_started_at IS NULL
      AND cleaned_at IS NULL
      AND cleanup_code IS NULL)
    OR
    (lifecycle_status = 'cleanup_pending'
      AND outcome IN ('passed', 'failed', 'blocked', 'cancelled', 'unknown')
      AND body_status = 'available'
      AND quota_status = 'charged'
      AND body_locator GLOB '.buildr/local/task-execution-records/*/*/'
      AND body_digest GLOB 'sha256-*'
      AND length(body_digest) = 71
      AND reserved_size_bytes = 0
      AND retain_until IS NOT NULL
      AND sealed_at IS NOT NULL
      AND cleanup_started_at IS NOT NULL
      AND cleaned_at IS NULL
      AND cleanup_code IS NULL)
    OR
    (lifecycle_status = 'cleaned'
      AND outcome IN ('passed', 'failed', 'blocked', 'cancelled', 'unknown')
      AND body_status = 'cleaned'
      AND quota_status = 'released'
      AND body_locator IS NULL
      AND body_digest GLOB 'sha256-*'
      AND length(body_digest) = 71
      AND reserved_size_bytes = 0
      AND retain_until IS NOT NULL
      AND sealed_at IS NOT NULL
      AND cleanup_started_at IS NULL
      AND cleaned_at IS NOT NULL
      AND cleanup_code IS NOT NULL
      AND trim(cleanup_code) <> '')
  ),
  CHECK (
    (outcome IN ('running', 'passed') AND resolution_status = 'not-required' AND resolved_at IS NULL)
    OR
    (outcome IN ('failed', 'blocked', 'cancelled') AND resolution_status = 'pending' AND resolved_at IS NULL)
    OR
    (outcome IN ('failed', 'blocked', 'cancelled', 'unknown') AND resolution_status IN ('acknowledged', 'recovered') AND resolved_at IS NOT NULL)
  )
) STRICT, WITHOUT ROWID;

INSERT INTO task_execution_records(
  record_id, schema_version, task_id, owner, kind, run_identity, invocation_identity, target_identity, producer,
  outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest,
  stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until,
  opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at
)
SELECT
  record_id, schema_version, task_id, owner, kind, run_identity, invocation_identity, target_identity, producer,
  outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest,
  stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until,
  opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at
FROM task_execution_records_before_unknown_outcome;

DROP TABLE task_execution_records_before_unknown_outcome;

CREATE INDEX task_execution_records_task_timeline_idx
  ON task_execution_records(task_id, opened_at DESC, record_id);
CREATE INDEX task_execution_records_task_owner_kind_recent_idx
  ON task_execution_records(task_id, owner, kind, sealed_at DESC, record_id);
CREATE INDEX task_execution_records_lifecycle_retention_idx
  ON task_execution_records(lifecycle_status, retain_until, task_id, record_id);
CREATE INDEX task_execution_records_task_owner_quota_idx
  ON task_execution_records(task_id, owner, quota_status);
CREATE INDEX task_execution_records_workspace_quota_idx
  ON task_execution_records(quota_status);
CREATE INDEX task_execution_records_active_invocation_idx
  ON task_execution_records(task_id, owner, kind, invocation_identity, lifecycle_status)
  WHERE lifecycle_status = 'open' AND invocation_identity IS NOT NULL;
