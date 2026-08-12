CREATE TEMP TABLE _buildr_task_finish_migration_assertion (
  valid INTEGER NOT NULL CHECK (valid = 1)
) STRICT;

INSERT INTO _buildr_task_finish_migration_assertion(valid)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM task_finish_transient_artifacts) THEN 1 ELSE 0 END;

INSERT INTO _buildr_task_finish_migration_assertion(valid)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM task_finish_runs AS run
  WHERE json_extract(run.run_json, '$.schemaVersion') <> 'buildr.task-finish-run/v2'
    OR json_extract(run.run_json, '$.runId') <> run.run_id
    OR json_extract(run.run_json, '$.identity.task') <> run.task_id
    OR json_extract(run.run_json, '$.status') <> run.status
    OR json_type(run.run_json, '$.phases') <> 'array'
    OR json_array_length(run.run_json, '$.phases') <> 5
    OR json_extract(run.run_json, '$.phases[0].id') <> 'preflight'
    OR json_extract(run.run_json, '$.phases[1].id') <> 'prepare'
    OR json_extract(run.run_json, '$.phases[2].id') <> 'verify'
    OR json_extract(run.run_json, '$.phases[3].id') <> 'deliver'
    OR json_extract(run.run_json, '$.phases[4].id') <> 'cleanup'
    OR EXISTS (
      SELECT 1 FROM json_each(run.run_json, '$.phases') AS phase
      WHERE json_extract(phase.value, '$.status') NOT IN ('pending', 'running', 'passed', 'blocked', 'failed', 'not-applicable')
    )
) THEN 1 ELSE 0 END;

INSERT INTO _buildr_task_finish_migration_assertion(valid)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM task_finish_completions AS completion
  LEFT JOIN task_finish_runs AS run ON run.task_id = completion.task_id
  WHERE json_extract(completion.result_json, '$.runId') <> completion.run_id
    OR json_extract(completion.result_json, '$.task') <> completion.task_id
    OR (run.task_id IS NOT NULL AND run.run_id <> completion.run_id)
    OR (run.task_id IS NULL AND completion.status <> 'complete')
    OR (run.task_id IS NULL AND json_type(completion.result_json, '$.result.phases') <> 'array')
    OR (run.task_id IS NULL AND json_array_length(completion.result_json, '$.result.phases') <> 5)
    OR (run.task_id IS NULL AND json_extract(completion.result_json, '$.result.phases[0].id') <> 'preflight')
    OR (run.task_id IS NULL AND json_extract(completion.result_json, '$.result.phases[1].id') <> 'prepare')
    OR (run.task_id IS NULL AND json_extract(completion.result_json, '$.result.phases[2].id') <> 'verify')
    OR (run.task_id IS NULL AND json_extract(completion.result_json, '$.result.phases[3].id') <> 'deliver')
    OR (run.task_id IS NULL AND json_extract(completion.result_json, '$.result.phases[4].id') <> 'cleanup')
) THEN 1 ELSE 0 END;

INSERT INTO _buildr_task_finish_migration_assertion(valid)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM task_finish_target_leases AS lease
  LEFT JOIN task_finish_runs AS run
    ON run.task_id = lease.task_id AND run.run_id = lease.run_id
  WHERE run.task_id IS NULL
) THEN 1 ELSE 0 END;

CREATE TABLE task_finish_current (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL UNIQUE,
  schema_version TEXT NOT NULL CHECK (schema_version = 'buildr.task-finish-current/v1'),
  status TEXT NOT NULL CHECK (status IN ('active', 'blocked', 'failed', 'complete', 'cleanup_pending')),
  identity_digest TEXT NOT NULL CHECK (trim(identity_digest) <> ''),
  current_phase TEXT NOT NULL CHECK (current_phase IN ('preflight', 'prepare', 'verify', 'deliver', 'cleanup')),
  handoff_identity TEXT NOT NULL CHECK (trim(handoff_identity) <> ''),
  candidate_identity TEXT NOT NULL CHECK (trim(candidate_identity) <> ''),
  candidate_generation INTEGER NOT NULL CHECK (candidate_generation >= 1),
  content_target_identity TEXT NOT NULL CHECK (trim(content_target_identity) <> ''),
  target_branch TEXT NOT NULL CHECK (trim(target_branch) <> ''),
  target_remote TEXT,
  carrier_identity TEXT,
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
    OR (lease_target_identity IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND status <> 'complete')
  ),
  CHECK (
    (association_handoff_identity IS NULL AND association_candidate_identity IS NULL AND association_candidate_generation IS NULL)
    OR (association_handoff_identity IS NOT NULL AND association_candidate_identity IS NOT NULL AND association_candidate_generation IS NOT NULL)
  ),
  CHECK ((status = 'complete' AND completed_at IS NOT NULL) OR status <> 'complete')
) STRICT, WITHOUT ROWID;

CREATE INDEX task_finish_current_status_updated_idx
  ON task_finish_current(status, updated_at DESC, task_id);
CREATE UNIQUE INDEX task_finish_current_lease_target_idx
  ON task_finish_current(lease_target_identity)
  WHERE lease_target_identity IS NOT NULL;
CREATE UNIQUE INDEX task_finish_current_lease_token_idx
  ON task_finish_current(lease_token)
  WHERE lease_token IS NOT NULL;

INSERT INTO task_finish_current(
  task_id, run_id, schema_version, status, identity_digest, current_phase,
  handoff_identity, candidate_identity, candidate_generation, content_target_identity,
  target_branch, target_remote, carrier_identity,
  association_handoff_identity, association_candidate_identity, association_candidate_generation,
  planning_gate_target_identity, completion_gate_target_identity, verification_gate_target_identity,
  primary_failure_phase, primary_failure_operation, primary_failure_class, primary_failure_code,
  primary_failure_status, primary_failure_exit_code, primary_failure_diagnostic_digest,
  resume_phase, resume_token, cleanup_status,
  lease_target_identity, lease_token, lease_expires_at,
  phases_json, payload_json, created_at, updated_at, completed_at
)
SELECT
  run.task_id,
  run.run_id,
  'buildr.task-finish-current/v1',
  run.status,
  run.identity_digest,
  COALESCE(
    json_extract(run.run_json, '$.resume.phase'),
    (SELECT json_extract(phase.value, '$.id') FROM json_each(run.run_json, '$.phases') AS phase WHERE json_extract(phase.value, '$.status') IN ('running', 'blocked', 'failed') ORDER BY CAST(phase.key AS INTEGER) LIMIT 1),
    (SELECT json_extract(phase.value, '$.id') FROM json_each(run.run_json, '$.phases') AS phase WHERE json_extract(phase.value, '$.status') = 'pending' ORDER BY CAST(phase.key AS INTEGER) LIMIT 1),
    'cleanup'
  ),
  json_extract(run.run_json, '$.identity.handoffIdentity'),
  json_extract(run.run_json, '$.identity.candidateIdentity'),
  json_extract(run.run_json, '$.identity.candidateGeneration'),
  json_extract(run.run_json, '$.identity.contentTargetIdentity'),
  json_extract(run.run_json, '$.identity.targetBranch'),
  json_extract(run.run_json, '$.identity.remote'),
  json_extract(run.run_json, '$.deliveryCarrier.identity'),
  json_extract(completion.result_json, '$.association.handoffIdentity'),
  json_extract(completion.result_json, '$.association.candidateIdentity'),
  json_extract(completion.result_json, '$.association.candidateGeneration'),
  json_extract(completion.result_json, '$.association.gates.planning.targetIdentity'),
  json_extract(completion.result_json, '$.association.gates.completion.targetIdentity'),
  json_extract(completion.result_json, '$.association.gates.verification.targetIdentity'),
  json_extract(run.run_json, '$.primaryFailure.phase'),
  json_extract(run.run_json, '$.primaryFailure.operation'),
  json_extract(run.run_json, '$.primaryFailure.failureClass'),
  json_extract(run.run_json, '$.primaryFailure.code'),
  json_extract(run.run_json, '$.primaryFailure.status'),
  json_extract(run.run_json, '$.primaryFailure.exitCode'),
  json_extract(run.run_json, '$.primaryFailure.diagnostic.digest'),
  json_extract(run.run_json, '$.resume.phase'),
  json_extract(run.run_json, '$.resume.token'),
  COALESCE(json_extract(completion.result_json, '$.cleanup.status'), json_extract(run.run_json, '$.completion.cleanup.status')),
  lease.target_identity,
  lease.token,
  lease.expires_at,
  json_extract(run.run_json, '$.phases'),
  json_object(
    'kind', 'run',
    'run', json(json_remove(run.run_json, '$.phases')),
    'preparedCompletion', CASE WHEN completion.task_id IS NULL THEN NULL ELSE json(completion.result_json) END
  ),
  COALESCE(json_extract(run.run_json, '$.createdAt'), run.updated_at),
  run.updated_at,
  run.completed_at
FROM task_finish_runs AS run
LEFT JOIN task_finish_completions AS completion ON completion.task_id = run.task_id
LEFT JOIN task_finish_target_leases AS lease ON lease.task_id = run.task_id AND lease.run_id = run.run_id;

INSERT INTO task_finish_current(
  task_id, run_id, schema_version, status, identity_digest, current_phase,
  handoff_identity, candidate_identity, candidate_generation, content_target_identity,
  target_branch, target_remote, carrier_identity,
  association_handoff_identity, association_candidate_identity, association_candidate_generation,
  planning_gate_target_identity, completion_gate_target_identity, verification_gate_target_identity,
  primary_failure_phase, primary_failure_operation, primary_failure_class, primary_failure_code,
  primary_failure_status, primary_failure_exit_code, primary_failure_diagnostic_digest,
  resume_phase, resume_token, cleanup_status,
  lease_target_identity, lease_token, lease_expires_at,
  phases_json, payload_json, created_at, updated_at, completed_at
)
SELECT
  completion.task_id,
  completion.run_id,
  'buildr.task-finish-current/v1',
  'complete',
  COALESCE(json_extract(completion.result_json, '$.result.identityDigest'), 'terminal:' || completion.run_id),
  'cleanup',
  json_extract(completion.result_json, '$.handoffIdentity'),
  json_extract(completion.result_json, '$.candidateIdentity'),
  json_extract(completion.result_json, '$.candidateGeneration'),
  json_extract(completion.result_json, '$.contentTargetIdentity'),
  json_extract(completion.result_json, '$.targetBranch'),
  json_extract(completion.result_json, '$.result.identity.remote'),
  json_extract(completion.result_json, '$.carrierIdentity'),
  json_extract(completion.result_json, '$.association.handoffIdentity'),
  json_extract(completion.result_json, '$.association.candidateIdentity'),
  json_extract(completion.result_json, '$.association.candidateGeneration'),
  json_extract(completion.result_json, '$.association.gates.planning.targetIdentity'),
  json_extract(completion.result_json, '$.association.gates.completion.targetIdentity'),
  json_extract(completion.result_json, '$.association.gates.verification.targetIdentity'),
  NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  NULL, NULL,
  json_extract(completion.result_json, '$.cleanup.status'),
  NULL, NULL, NULL,
  json_extract(completion.result_json, '$.result.phases'),
  json_object(
    'kind', 'terminal',
    'identityDigest', COALESCE(json_extract(completion.result_json, '$.result.identityDigest'), 'terminal:' || completion.run_id),
    'completion', json(json_remove(completion.result_json, '$.result.phases'))
  ),
  COALESCE(json_extract(completion.result_json, '$.preparedAt'), completion.updated_at),
  completion.updated_at,
  COALESCE(completion.completed_at, json_extract(completion.result_json, '$.completedAt'))
FROM task_finish_completions AS completion
LEFT JOIN task_finish_runs AS run ON run.task_id = completion.task_id
WHERE run.task_id IS NULL;

INSERT INTO _buildr_task_finish_migration_assertion(valid)
SELECT CASE WHEN (
  SELECT COUNT(*) FROM task_finish_current
) = (
  SELECT COUNT(*) FROM task_finish_runs
) + (
  SELECT COUNT(*) FROM task_finish_completions AS completion
  LEFT JOIN task_finish_runs AS run ON run.task_id = completion.task_id
  WHERE run.task_id IS NULL
) THEN 1 ELSE 0 END;

DROP TABLE task_finish_transient_artifacts;
DROP TABLE task_finish_target_leases;
DROP TABLE task_finish_completions;
DROP TABLE task_finish_runs;
DROP TABLE _buildr_task_finish_migration_assertion;
