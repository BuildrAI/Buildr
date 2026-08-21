# Infrastructure / Persistence inventory

## Technical mechanism owners

| Mechanism | Single owner | Bootstrap entry | Direct consumers |
| --- | --- | --- | --- |
| SQLite connection, operation scope, lock/transaction and global migration | `src/infrastructure/sqlite/workspace-sqlite.mjs` | `src/infrastructure/index.mjs:registerInfrastructure` | Task Persistence repositories and Workspace/Task Applications through runtime capability methods |
| Filesystem lock, atomic write and workspace mutation | `src/infrastructure/filesystem/index.mjs` | `src/infrastructure/index.mjs:registerInfrastructure` | Workspace/project stores and technical adapters |
| Git identity/observation and contribution plumbing | `src/infrastructure/git/` | Bootstrap runtime imports | Git worktree and delivery adapters |
| Process, network and platform adapters | `src/infrastructure/process.mjs`, `src/infrastructure/network/`, `src/infrastructure/platform.mjs` | `src/bootstrap/runtime.mjs` platform composition and runtime imports | CLI, HTTP host, verification and launcher adapters |
| Product resource/payload resolution | `src/infrastructure/product-resources/` | Bootstrap/runtime and payload tools | npm/application payload and migration asset consumers |

## Business Persistence owners

All Task business repositories and storage objects are under `src/task/persistence/` and are registered once by `registerTaskPersistence`:

- coordination, development, environment, overview, retrospective, review and verification projections;
- Task Finish current/lease/completion persistence;
- Task Execution Record rows and filesystem body store;
- Task Record remains its existing private module-owned `record` persistence.

Infrastructure does not import these modules and retains only the generic SQLite/filesystem mechanisms. The migration directory remains at `src/infrastructure/sqlite/migrations`; no script, version, checksum or execution algorithm moved.

## Boundary regression evidence

- `test/contract/infrastructure-boundaries.test.mjs` rejects business repositories under Infrastructure, checks the single Bootstrap entries, and compares the ordered migration inventory across repeated loads.
- Existing repository integration tests and CLI architecture verification cover behavior and import-graph equivalence.
