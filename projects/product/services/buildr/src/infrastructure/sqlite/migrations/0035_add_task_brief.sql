ALTER TABLE tasks ADD COLUMN brief TEXT CHECK (brief IS NULL OR length(CAST(brief AS BLOB)) <= 1048576);
ALTER TABLE tasks ADD COLUMN brief_digest TEXT CHECK (brief_digest IS NULL OR (length(brief_digest) = 71 AND substr(brief_digest, 1, 7) = 'sha256-' AND substr(brief_digest, 8) NOT GLOB '*[^0-9a-f]*'));
ALTER TABLE tasks ADD COLUMN result_history_digest TEXT NOT NULL DEFAULT 'sha256-4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945' CHECK (length(result_history_digest) = 71 AND substr(result_history_digest, 1, 7) = 'sha256-' AND substr(result_history_digest, 8) NOT GLOB '*[^0-9a-f]*');
UPDATE tasks SET result_history_digest = buildr_sha256(result_history_json);
