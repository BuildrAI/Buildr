ALTER TABLE task_development_current ADD COLUMN applicability_status TEXT
  CHECK (applicability_status IS NULL OR applicability_status IN ('planning', 'developing', 'candidate-current', 'handoff-current', 'blocked', 'unknown'));
ALTER TABLE task_development_current ADD COLUMN applicability_json TEXT
  CHECK (applicability_json IS NULL OR json_valid(applicability_json));
ALTER TABLE task_development_current ADD COLUMN observed_at TEXT
  CHECK (observed_at IS NULL OR datetime(observed_at) IS NOT NULL);

ALTER TABLE task_review_current ADD COLUMN target_identity TEXT;
ALTER TABLE task_review_current ADD COLUMN outcome TEXT
  CHECK (outcome IS NULL OR outcome IN ('ready', 'changes-required'));
ALTER TABLE task_review_current ADD COLUMN updated_at TEXT
  CHECK (updated_at IS NULL OR datetime(updated_at) IS NOT NULL);

UPDATE task_review_current
SET target_identity = json_extract(result_json, '$.targetIdentity'),
    outcome = json_extract(result_json, '$.conclusion.outcome'),
    updated_at = json_extract(result_json, '$.completedAt');

CREATE TEMP TABLE _buildr_review_migration_assertion (
  valid INTEGER NOT NULL CHECK (valid = 1)
) STRICT;
INSERT INTO _buildr_review_migration_assertion(valid)
SELECT 0 FROM task_review_current
WHERE target_identity IS NULL OR target_identity = ''
   OR outcome NOT IN ('ready', 'changes-required')
   OR datetime(updated_at) IS NULL;
DROP TABLE _buildr_review_migration_assertion;

ALTER TABLE task_verification_current ADD COLUMN target_identity TEXT;
ALTER TABLE task_verification_current ADD COLUMN outcome TEXT
  CHECK (outcome IS NULL OR outcome IN ('passed', 'not-passed'));
ALTER TABLE task_verification_current ADD COLUMN updated_at TEXT
  CHECK (updated_at IS NULL OR datetime(updated_at) IS NOT NULL);

UPDATE task_verification_current
SET target_identity = json_extract(result_json, '$.target.identity'),
    outcome = json_extract(result_json, '$.conclusion.outcome'),
    updated_at = json_extract(result_json, '$.completedAt');

CREATE TEMP TABLE _buildr_verification_migration_assertion (
  valid INTEGER NOT NULL CHECK (valid = 1)
) STRICT;
INSERT INTO _buildr_verification_migration_assertion(valid)
SELECT 0 FROM task_verification_current
WHERE target_identity IS NULL OR target_identity = ''
   OR outcome NOT IN ('passed', 'not-passed')
   OR datetime(updated_at) IS NULL;
DROP TABLE _buildr_verification_migration_assertion;

UPDATE task_development_current
SET applicability_status = json_extract(
      (SELECT model_json FROM task_lifecycle_current WHERE task_id = task_development_current.task_id),
      '$.development.applicability.status'
    ),
    applicability_json = json_extract(
      (SELECT model_json FROM task_lifecycle_current WHERE task_id = task_development_current.task_id),
      '$.development.applicability'
    ),
    observed_at = json_extract(
      (SELECT model_json FROM task_lifecycle_current WHERE task_id = task_development_current.task_id),
      '$.development.observedAt'
    )
WHERE EXISTS (
  SELECT 1 FROM task_lifecycle_current
  WHERE task_id = task_development_current.task_id
    AND json_type(model_json, '$.development.applicability') = 'object'
    AND json_extract(model_json, '$.development.applicability.status') IN ('planning', 'developing', 'candidate-current', 'handoff-current', 'blocked', 'unknown')
    AND datetime(json_extract(model_json, '$.development.observedAt')) IS NOT NULL
);

CREATE TEMP TABLE _buildr_terminal_association_assertion (
  valid INTEGER NOT NULL CHECK (valid = 1)
) STRICT;
INSERT INTO _buildr_terminal_association_assertion(valid)
SELECT 0
FROM task_lifecycle_current AS lifecycle
LEFT JOIN task_finish_completions AS completion ON completion.task_id = lifecycle.task_id
WHERE json_type(lifecycle.model_json, '$.finish.association') = 'object'
  AND (
    completion.task_id IS NULL
    OR json_extract(completion.result_json, '$.association.schemaVersion') IS NOT json_extract(lifecycle.model_json, '$.finish.association.schemaVersion')
    OR json_extract(completion.result_json, '$.association.handoffIdentity') IS NOT json_extract(lifecycle.model_json, '$.finish.association.handoffIdentity')
    OR json_extract(completion.result_json, '$.association.candidateIdentity') IS NOT json_extract(lifecycle.model_json, '$.finish.association.candidateIdentity')
    OR json_extract(completion.result_json, '$.association.candidateGeneration') IS NOT json_extract(lifecycle.model_json, '$.finish.association.candidateGeneration')
    OR json_extract(completion.result_json, '$.association.gates.planning.status') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.planning.status')
    OR json_extract(completion.result_json, '$.association.gates.planning.targetIdentity') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.planning.targetIdentity')
    OR json_extract(completion.result_json, '$.association.gates.planning.resultDigest') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.planning.resultDigest')
    OR json_extract(completion.result_json, '$.association.gates.planning.disposition') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.planning.disposition')
    OR json_extract(completion.result_json, '$.association.gates.completion.status') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.completion.status')
    OR json_extract(completion.result_json, '$.association.gates.completion.targetIdentity') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.completion.targetIdentity')
    OR json_extract(completion.result_json, '$.association.gates.completion.resultDigest') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.completion.resultDigest')
    OR json_extract(completion.result_json, '$.association.gates.completion.disposition') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.completion.disposition')
    OR json_extract(completion.result_json, '$.association.gates.verification.status') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.verification.status')
    OR json_extract(completion.result_json, '$.association.gates.verification.targetIdentity') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.verification.targetIdentity')
    OR json_extract(completion.result_json, '$.association.gates.verification.resultDigest') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.verification.resultDigest')
    OR json_extract(completion.result_json, '$.association.gates.verification.disposition') IS NOT json_extract(lifecycle.model_json, '$.finish.association.gates.verification.disposition')
  );
DROP TABLE _buildr_terminal_association_assertion;

CREATE INDEX task_development_current_status_idx
  ON task_development_current(applicability_status, observed_at DESC, task_id);
CREATE INDEX task_review_current_target_idx
  ON task_review_current(review_type, target_identity, updated_at DESC, task_id);
CREATE INDEX task_verification_current_target_idx
  ON task_verification_current(target_identity, updated_at DESC, task_id);

DROP TABLE task_lifecycle_current;
