CREATE TABLE terminal_contribution_reconciliations_next (
  child_task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  parent_task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  parent_plan_identity TEXT NOT NULL CHECK (trim(parent_plan_identity) <> ''),
  reconciliation_identity TEXT NOT NULL UNIQUE CHECK (trim(reconciliation_identity) <> ''),
  record_json TEXT NOT NULL CHECK (
    json_valid(record_json)
    AND json_type(record_json) = 'object'
    AND json_extract(record_json, '$.schemaVersion') IN ('buildr.terminal-contribution-reconciliation/v1', 'buildr.terminal-contribution-reconciliation/v2')
    AND json_extract(record_json, '$.childTaskId') = child_task_id
    AND json_extract(record_json, '$.parentTaskId') = parent_task_id
    AND json_extract(record_json, '$.parentPlanIdentity') = parent_plan_identity
    AND json_extract(record_json, '$.identity') = reconciliation_identity
  ),
  created_at TEXT NOT NULL CHECK (trim(created_at) <> '')
) STRICT, WITHOUT ROWID;

INSERT INTO terminal_contribution_reconciliations_next SELECT * FROM terminal_contribution_reconciliations;
DROP TABLE terminal_contribution_reconciliations;
ALTER TABLE terminal_contribution_reconciliations_next RENAME TO terminal_contribution_reconciliations;
CREATE INDEX terminal_contribution_reconciliations_parent_idx ON terminal_contribution_reconciliations(parent_task_id, child_task_id);
