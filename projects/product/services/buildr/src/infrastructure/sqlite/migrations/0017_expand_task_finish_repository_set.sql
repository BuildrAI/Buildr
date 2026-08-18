CREATE TABLE task_finish_current_next (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL UNIQUE,
  schema_version TEXT NOT NULL CHECK (schema_version = 'buildr.task-finish-current/v2'),
  status TEXT NOT NULL CHECK (status IN ('active', 'blocked', 'failed', 'complete', 'cleanup_pending')),
  identity_digest TEXT NOT NULL CHECK (trim(identity_digest) <> ''),
  current_phase TEXT NOT NULL CHECK (current_phase IN ('preflight', 'prepare', 'verify', 'deliver', 'cleanup')),
  handoff_identity TEXT NOT NULL CHECK (trim(handoff_identity) <> ''),
  candidate_identity TEXT NOT NULL CHECK (trim(candidate_identity) <> ''),
  candidate_generation INTEGER NOT NULL CHECK (candidate_generation >= 1),
  content_target_identity TEXT NOT NULL CHECK (trim(content_target_identity) <> ''),
  target_branch TEXT,
  target_remote TEXT,
  carrier_identity TEXT,
  repository_set_identity TEXT,
  carrier_set_identity TEXT,
  delivery_set_identity TEXT,
  association_handoff_identity TEXT,
  association_candidate_identity TEXT,
  association_candidate_generation INTEGER CHECK (association_candidate_generation IS NULL OR association_candidate_generation >= 1),
  planning_gate_target_identity TEXT,
  completion_gate_target_identity TEXT,
  verification_gate_target_identity TEXT,
  primary_failure_phase TEXT CHECK (primary_failure_phase IS NULL OR primary_failure_phase IN ('preflight', 'prepare', 'verify', 'deliver', 'cleanup')),
  primary_failure_operation TEXT,
  primary_failure_class TEXT,
  primary_failure_code TEXT,
  primary_failure_status TEXT,
  primary_failure_exit_code INTEGER,
  primary_failure_diagnostic_digest TEXT,
  resume_phase TEXT CHECK (resume_phase IS NULL OR resume_phase IN ('preflight', 'prepare', 'verify', 'deliver', 'cleanup')),
  resume_token TEXT,
  cleanup_status TEXT,
  lease_target_identity TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  phases_json TEXT NOT NULL CHECK (
    json_valid(phases_json)
    AND json_type(phases_json) = 'array'
    AND json_array_length(phases_json) = 5
    AND json_extract(phases_json, '$[0].id') = 'preflight'
    AND json_extract(phases_json, '$[1].id') = 'prepare'
    AND json_extract(phases_json, '$[2].id') = 'verify'
    AND json_extract(phases_json, '$[3].id') = 'deliver'
    AND json_extract(phases_json, '$[4].id') = 'cleanup'
    AND json_extract(phases_json, '$[0].status') IN ('pending', 'running', 'passed', 'blocked', 'failed', 'not-applicable')
    AND json_extract(phases_json, '$[1].status') IN ('pending', 'running', 'passed', 'blocked', 'failed', 'not-applicable')
    AND json_extract(phases_json, '$[2].status') IN ('pending', 'running', 'passed', 'blocked', 'failed', 'not-applicable')
    AND json_extract(phases_json, '$[3].status') IN ('pending', 'running', 'passed', 'blocked', 'failed', 'not-applicable')
    AND json_extract(phases_json, '$[4].status') IN ('pending', 'running', 'passed', 'blocked', 'failed', 'not-applicable')
    AND json_type(phases_json, '$[0].attempts') = 'integer' AND json_extract(phases_json, '$[0].attempts') >= 0
    AND json_type(phases_json, '$[1].attempts') = 'integer' AND json_extract(phases_json, '$[1].attempts') >= 0
    AND json_type(phases_json, '$[2].attempts') = 'integer' AND json_extract(phases_json, '$[2].attempts') >= 0
    AND json_type(phases_json, '$[3].attempts') = 'integer' AND json_extract(phases_json, '$[3].attempts') >= 0
    AND json_type(phases_json, '$[4].attempts') = 'integer' AND json_extract(phases_json, '$[4].attempts') >= 0
  ),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  created_at TEXT NOT NULL CHECK (trim(created_at) <> ''),
  updated_at TEXT NOT NULL CHECK (trim(updated_at) <> ''),
  completed_at TEXT,
  CHECK ((resume_phase IS NULL AND resume_token IS NULL) OR (resume_phase IS NOT NULL AND resume_token IS NOT NULL)),
  CHECK (
    (lease_target_identity IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_target_identity IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CHECK (
    (association_handoff_identity IS NULL AND association_candidate_identity IS NULL AND association_candidate_generation IS NULL)
    OR (association_handoff_identity IS NOT NULL AND association_candidate_identity IS NOT NULL AND association_candidate_generation IS NOT NULL)
  ),
  CHECK ((status = 'complete' AND completed_at IS NOT NULL) OR status <> 'complete')
) STRICT, WITHOUT ROWID;

INSERT INTO task_finish_current_next(
  task_id, run_id, schema_version, status, identity_digest, current_phase,
  handoff_identity, candidate_identity, candidate_generation, content_target_identity,
  target_branch, target_remote, carrier_identity,
  repository_set_identity, carrier_set_identity, delivery_set_identity,
  association_handoff_identity, association_candidate_identity, association_candidate_generation,
  planning_gate_target_identity, completion_gate_target_identity, verification_gate_target_identity,
  primary_failure_phase, primary_failure_operation, primary_failure_class, primary_failure_code,
  primary_failure_status, primary_failure_exit_code, primary_failure_diagnostic_digest,
  resume_phase, resume_token, cleanup_status,
  lease_target_identity, lease_token, lease_expires_at,
  phases_json, payload_json, created_at, updated_at, completed_at
)
SELECT
  task_id, run_id, 'buildr.task-finish-current/v2', status, identity_digest, current_phase,
  handoff_identity, candidate_identity, candidate_generation, content_target_identity,
  target_branch, target_remote, carrier_identity,
  NULL, NULL, NULL,
  association_handoff_identity, association_candidate_identity, association_candidate_generation,
  planning_gate_target_identity, completion_gate_target_identity, verification_gate_target_identity,
  primary_failure_phase, primary_failure_operation, primary_failure_class, primary_failure_code,
  primary_failure_status, primary_failure_exit_code, primary_failure_diagnostic_digest,
  resume_phase, resume_token, cleanup_status,
  lease_target_identity, lease_token, lease_expires_at,
  phases_json, payload_json, created_at, updated_at, completed_at
FROM task_finish_current;

DROP TABLE task_finish_current;

ALTER TABLE task_finish_current_next RENAME TO task_finish_current;

CREATE INDEX task_finish_current_status_updated_idx
  ON task_finish_current(status, updated_at DESC, task_id);
CREATE UNIQUE INDEX task_finish_current_lease_target_idx
  ON task_finish_current(lease_target_identity)
  WHERE lease_target_identity IS NOT NULL;
CREATE UNIQUE INDEX task_finish_current_lease_token_idx
  ON task_finish_current(lease_token)
  WHERE lease_token IS NOT NULL;
