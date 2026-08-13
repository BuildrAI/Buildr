ALTER TABLE task_execution_records
  ADD COLUMN invocation_identity TEXT
  CHECK (
    invocation_identity IS NULL
    OR (
      length(invocation_identity) = 71
      AND substr(invocation_identity, 1, 7) = 'sha256-'
      AND substr(invocation_identity, 8) NOT GLOB '*[^0-9a-f]*'
    )
  );

CREATE INDEX task_execution_records_active_invocation_idx
  ON task_execution_records(task_id, owner, kind, invocation_identity, lifecycle_status)
  WHERE lifecycle_status = 'open' AND invocation_identity IS NOT NULL;
