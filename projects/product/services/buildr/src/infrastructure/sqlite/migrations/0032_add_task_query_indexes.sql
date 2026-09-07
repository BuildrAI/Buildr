CREATE INDEX tasks_feed_order_idx ON tasks(
  (CASE status
    WHEN 'active' THEN 0
    WHEN 'todo' THEN 1
    WHEN 'completed' THEN 2
    WHEN 'abandoned' THEN 3
  END),
  updated_at DESC,
  task_id
);

CREATE VIRTUAL TABLE task_search USING fts5(
  task_id,
  title,
  intent,
  content='tasks',
  content_rowid='rowid',
  tokenize='trigram'
);

INSERT INTO task_search(task_search) VALUES('rebuild');

CREATE TRIGGER tasks_search_after_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO task_search(rowid, task_id, title, intent)
  VALUES (new.rowid, new.task_id, new.title, new.intent);
END;

CREATE TRIGGER tasks_search_after_delete AFTER DELETE ON tasks BEGIN
  INSERT INTO task_search(task_search, rowid, task_id, title, intent)
  VALUES ('delete', old.rowid, old.task_id, old.title, old.intent);
END;

CREATE TRIGGER tasks_search_after_update AFTER UPDATE OF task_id, title, intent ON tasks BEGIN
  INSERT INTO task_search(task_search, rowid, task_id, title, intent)
  VALUES ('delete', old.rowid, old.task_id, old.title, old.intent);
  INSERT INTO task_search(rowid, task_id, title, intent)
  VALUES (new.rowid, new.task_id, new.title, new.intent);
END;
