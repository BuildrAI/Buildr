## Context

See [proposal.md](proposal.md) for the reason and scope. The asset application already checks the catalog revision and writes the three manifests through `withWorkspaceMutation`; directory renames currently happen after that transaction. `projectIds` also distinguishes a user-selected full membership set from a parent directory used to locate a service, but nested `newServices` currently only receives the parent project's membership.

## Goals / Non-Goals

**Goals:**
- Make managed directory renames and catalog writes one recoverable operation, rejecting occupied destinations before any lasting mutation.
- Keep externally attached project source paths unchanged when the project code changes.
- Ensure explicit relationship selections and nested service draft references survive all project/service creation routes.

**Non-Goals:**
- Change the many-to-many project/service model, HTTP field names, repository ownership, Git remotes, or module-path meaning.
- Move external project roots, infer additional affiliations after an explicit full-set selection, or merge pre-existing directory contents.

## Decisions

- **Represent managed directory renames as part of the asset mutation.** The application prepares relative source/destination pairs only for a managed project source whose declared path is exactly `projects/<oldCode>`, and for a service-document namespace `services/<oldCode>`. Both paths join the workspace mutation's observed affected-path set; the application checks that each destination is absent before and again inside the mutation lock, then performs the rename before writing manifests. When the project directory moves, repository registrations whose non-attached `source.path` is equal to or beneath that project prefix receive the same prefix rewrite. Services using a repository root above the project receive a `modulePath` prefix rewrite only when their resolved module path lies under the moved project; roots that move with the project keep their relative module paths. Repository identity, Git declaration and actual service code location remain stable. If any write fails, the mutation snapshots restore the original paths and manifests. A code rename for an attached project updates identity/history only and never moves its source.
- **Reject occupied destinations rather than adopting or merging them.** A path collision is a conflict even when the source directory is missing: the application cannot prove that the target belongs to the renamed asset. The whole request fails with no manifest or directory changes. The previous post-commit best-effort rename was rejected because it could direct an identity at unrelated content or leave its registered path inconsistent.
- **Give explicit project membership precedence over location inference.** `projectCode` and a directory candidate can infer a default relationship only when `projectIds` is omitted. When `projectIds` is present it is the complete membership selected by the caller; a request-level fixed `projectId` remains mandatory and is unioned. This preserves both the standalone form's ability to select a project different from an existing directory's owner and the fixed-parent flow.
- **Process nested draft relationships inside the parent transaction.** Project `newServices` always belong to their parent project; any other values in the draft's `projectIds` are resolved against the current catalog and added to the other project memberships. Invalid references abort the parent mutation. Project history references are updated only after the final membership sets are known.
- **Validate inline directory services against pending project moves.** The proposed project identity and directory move are made visible before nested service owner and Git-root checks. Git-root discovery and repository reuse inspect the mapped pre-move path, while the saved `source.path` and derived `modulePath` use the post-move path. Filesystem creation remains deferred until the project move succeeds. Any path conflict or validation error rolls back the catalog view and all physical writes.

## Risks / Trade-offs

- **[Risk] Snapshotting a managed project directory can add copy cost for a large directory.** → The snapshots are scoped to the paths actually renamed, only code-renaming operations pay the cost, and they provide rollback after a manifest-write failure.
- **[Risk] A user may expect to rename into an existing empty directory.** → The system cannot distinguish an empty destination from an unrelated asset or preserve its identity safely; it reports the conflict and leaves both directories untouched for an explicit user resolution.
- **[Risk] An explicit empty `projectIds` removes a directory-inferred membership.** → This is intentional: the selector is the full relationship set, while the directory path describes location. A fixed request-level or nested parent remains linked independently.

## Migration Plan

No catalog version or stored field changes are required. New behavior applies on the next edit. If a rename destination already exists, the user must resolve or choose a different code; the system will not delete, merge, or adopt it. Existing manifests and historical references remain readable.
