CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version >= 0),
  name TEXT NOT NULL UNIQUE CHECK (
    length(name) > 9
    AND substr(name, 1, 4) NOT GLOB '*[^0-9]*'
    AND substr(name, 5, 1) = '_'
    AND substr(name, 6, length(name) - 9) NOT GLOB '*[^a-z0-9_]*'
    AND substr(name, -4) = '.sql'
  ),
  checksum TEXT NOT NULL CHECK (
    length(checksum) = 71
    AND substr(checksum, 1, 7) = 'sha256-'
    AND substr(checksum, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  applied_at TEXT NOT NULL CHECK (datetime(applied_at) IS NOT NULL)
) STRICT;
