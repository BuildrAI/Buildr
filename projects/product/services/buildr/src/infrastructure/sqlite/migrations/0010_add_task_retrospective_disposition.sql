CREATE TABLE task_retrospective_current_next (
  task_id TEXT PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  disposition_status TEXT NOT NULL CHECK (disposition_status IN ('pending', 'handled', 'no-action')),
  disposition_note TEXT,
  disposed_at TEXT,
  CHECK (
    (disposition_status = 'pending' AND disposition_note IS NULL AND disposed_at IS NULL)
    OR
    (disposition_status IN ('handled', 'no-action') AND disposition_note IS NOT NULL AND trim(disposition_note) <> '' AND disposed_at IS NOT NULL)
  )
) STRICT, WITHOUT ROWID;

INSERT INTO task_retrospective_current_next(task_id, result_json, disposition_status, disposition_note, disposed_at)
SELECT task_id, result_json, 'pending', NULL, NULL
FROM task_retrospective_current;

DROP TABLE task_retrospective_current;
ALTER TABLE task_retrospective_current_next RENAME TO task_retrospective_current;
