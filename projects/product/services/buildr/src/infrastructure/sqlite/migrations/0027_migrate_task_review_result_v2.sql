-- buildr:foreign-keys-off

CREATE TEMP TABLE _buildr_task_review_v2_assertion (
  valid INTEGER NOT NULL CHECK (valid = 1)
) STRICT;

INSERT INTO _buildr_task_review_v2_assertion(valid)
SELECT 0
FROM task_review_current
WHERE NOT json_valid(result_json)
   OR json_type(result_json) <> 'object'
   OR json_extract(result_json, '$.schemaVersion') <> 'buildr.task-review-result/v1'
   OR json_extract(result_json, '$.taskId') <> task_id
   OR json_extract(result_json, '$.reviewType') <> review_type
   OR json_extract(result_json, '$.targetIdentity') <> target_identity
   OR trim(target_identity) = ''
   OR json_extract(result_json, '$.conclusion.outcome') <> outcome
   OR outcome NOT IN ('ready', 'changes-required')
   OR json_extract(result_json, '$.completedAt') <> updated_at;

CREATE TABLE task_review_current_next (
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  review_type TEXT NOT NULL CHECK (review_type IN ('planning', 'completion')),
  result_json TEXT NOT NULL CHECK (
    json_valid(result_json)
    AND json_type(result_json) = 'object'
    AND json_extract(result_json, '$.schemaVersion') = 'buildr.task-review-result/v2'
    AND json_extract(result_json, '$.taskId') = task_id
    AND json_extract(result_json, '$.reviewType') = review_type
  ),
  subject_identity TEXT NOT NULL CHECK (trim(subject_identity) <> ''),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'changes-requested')),
  updated_at TEXT NOT NULL CHECK (datetime(updated_at) IS NOT NULL),
  PRIMARY KEY (task_id, review_type)
) STRICT, WITHOUT ROWID;

INSERT INTO task_review_current_next(task_id, review_type, result_json, subject_identity, outcome, updated_at)
SELECT task_id,
  review_type,
  json_set(
    json_remove(result_json, '$.targetIdentity'),
    '$.schemaVersion', 'buildr.task-review-result/v2',
    '$.subjectIdentity', target_identity,
    '$.conclusion.outcome', CASE outcome WHEN 'ready' THEN 'accepted' ELSE 'changes-requested' END
  ),
  target_identity,
  CASE outcome WHEN 'ready' THEN 'accepted' ELSE 'changes-requested' END,
  updated_at
FROM task_review_current;

INSERT INTO _buildr_task_review_v2_assertion(valid)
SELECT 0
FROM task_review_current_next
WHERE json_extract(result_json, '$.subjectIdentity') <> subject_identity
   OR json_type(result_json, '$.targetIdentity') IS NOT NULL
   OR json_extract(result_json, '$.conclusion.outcome') <> outcome
   OR json_extract(result_json, '$.completedAt') <> updated_at;

DROP INDEX IF EXISTS task_review_current_target_idx;
DROP TABLE task_review_current;
ALTER TABLE task_review_current_next RENAME TO task_review_current;

CREATE INDEX task_review_current_subject_idx
  ON task_review_current(review_type, subject_identity, updated_at DESC, task_id);

DROP TABLE _buildr_task_review_v2_assertion;
