## 1. Repository-set domain and persistence

- [x] 1.1 Add deterministic repository planning, repository-scoped target identity, contribution disposition, and v3 run/result normalization with singleton compatibility projections.
- [x] 1.2 Add the continuous SQLite migration and repository query-field validation for repository-set/carrier-set identities while preserving bounded v2 reads.
- [x] 1.3 Cover domain normalization, singleton projection, multi-repository identity, migration, and fail-closed legacy states with focused unit/integration tests.

## 2. Entry readiness and carrier preparation

- [x] 2.1 Refactor entry readiness to observe each Environment repository, skip remote resolution for no-contribution entries, and reject ambiguous single-value overrides.
- [x] 2.2 Refactor the Git carrier adapter to use run-owned per-repository paths and only validate commit messages for commits owned by the current carrier.
- [x] 2.3 Add regression tests proving an empty Workspace contribution cannot inspect its baseline HEAD message and that multiple contributing repositories prepare before delivery.

## 3. Multi-repository execution and recovery

- [x] 3.1 Extend prepare and verify to process all contributing repositories while keeping the fixed five-phase public model.
- [x] 3.2 Add repository-scoped target leases, durable in-phase delivery checkpoints, already-delivered containment checks, and resume of the earliest unfinished repository.
- [x] 3.3 Add bounded replacement of the exact legacy no-side-effect commit-message mismatch run when the same initial command is repeated.
- [x] 3.4 Update result projections, Execution Record evidence, occupancy release, and self-bootstrap carrier selection for repository-set results.

## 4. Environment cleanup

- [x] 4.1 Add a distinct no-contribution cleanup proof and teach the Git worktree provider to recompute it without requiring ancestry or an empty carrier commit.
- [x] 4.2 Pass integrated refs and contribution/no-contribution proofs for every Environment repository through retained cleanup, then remove all repository carriers and the run-owned container.
- [x] 4.3 Add cleanup recovery tests for mixed contribution, empty-commit no-contribution, proof drift, partial worktree removal, and idempotent retry.

## 5. Product journeys and current knowledge

- [x] 5.1 Preserve the existing single-repository Task Finish journey and add a real multi-Git-repository system fixture covering mixed contribution, multiple contributions, target advance, partial delivery recovery, remote readback, and unified cleanup.
- [x] 5.2 Run focused bug-regression tests, the affected Task Finish/Environment suites, package static checks, and the complete registered Buildr test selection required by the final candidate.
- [x] 5.3 Reconcile `brief.md`, `.buildr/knowledge-impact.yml`, and `openspec/knowledge/architecture/technical.md` with the final implementation and test evidence before convergence.
