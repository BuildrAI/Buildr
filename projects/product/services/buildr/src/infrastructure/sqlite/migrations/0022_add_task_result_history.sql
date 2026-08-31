ALTER TABLE tasks ADD COLUMN result_history_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(result_history_json) AND json_type(result_history_json) = 'array');
