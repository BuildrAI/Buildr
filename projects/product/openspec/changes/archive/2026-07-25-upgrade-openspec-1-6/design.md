## Context

Buildr packages an OpenSpec integration rather than treating the upstream CLI as an implementation detail. The current integration binds `@fission-ai/openspec`, the OpenSpec Component metadata, external workflow Skill sources, integrity records, the external Command declaration, and the Buildr contract guard to 1.4.1. Upstream 1.6.0 adds the experimental planning-only `opsx:update` workflow and archive/validation fixes, while its Stores model remains explicitly early beta.

The upgrade crosses package assets, workspace Component lifecycle, runtime Skill assembly, and the contract guard. It must preserve Buildr's boundary: Buildr declares and diagnoses the user's external CLI but does not install it; Buildr owns its sidebars and guard but does not fork or edit the upstream workflow source.

## Goals / Non-Goals

**Goals:**

- Establish 1.6.0 as one coherent, verifiably supported OpenSpec integration version.
- Adopt `openspec-update-change` only as a planning-artifact reconciliation workflow, with no authority to modify implementation code or create missing artifacts.
- Keep upstream Stores outside the default Buildr surface until it is stable and separately evaluated.
- Remove OpenSpec parser/archive checks that 1.6.0 now owns, while retaining Buildr's cross-change and evidence-grade contract safety.
- Prove that Component lifecycle, external-Skill integrity, runtime contributions, retained contract guard checks, and package verification remain coherent.

**Non-Goals:**

- Installing, upgrading, or migrating any user's machine-local OpenSpec CLI.
- Making Buildr own Project `openspec/` data, OpenSpec Stores, or upstream workspace/store migrations.
- Replacing OpenSpec's workflow selection with Buildr routing, or changing the semantics of existing `explore`, `propose`, `apply`, `sync`, and `archive` workflows.
- Adding every upstream workflow merely because the generator exposes it.

## Decisions

### Treat the release as one integration boundary

Upgrade the package dependency, lockfile, Component upstream metadata/version, Command constraint/install hint, upstream Skill sources, generated package targets, and contract-guard support evidence in one change. Package verification must reject a partial version transition.

Alternative considered: update only the dev dependency and use the new CLI locally. Rejected because the workspace Component would keep advertising old Skills and guard compatibility, causing a false supported state.

### Adopt `opsx:update` after source and boundary review

Add the upstream `openspec-update-change` Skill and only the Buildr-specific sidebar content that remains necessary after reading the released template. OpenSpec already owns status/path resolution, planning-only edits, per-artifact confirmation, and redirection to `apply`; the sidebar only preserves Buildr's rule that a later transition into implementation must repeat the task-worktree decision.

Alternative considered: leave the workflow out indefinitely. Rejected because it fills a distinct planning-only gap—reconciling existing artifacts—without making Buildr an implementation planner. The workflow remains separately identifiable and may be removed in a later Component release if upstream behavior regresses.

### Exclude Stores from the supported default

Do not expose Store commands, data ownership, migrations, or Store-aware workflow routing. The 1.6.0 CLI may contain this upstream beta surface, but Buildr's Component and Skills will not advertise it.

Alternative considered: enable Stores because they replace the upstream workspace/initiative direction. Rejected because upstream labels them early beta and their persistence/migration semantics have not been evaluated against Buildr's Project and Component boundaries.

### Retain the external-CLI and external-Skill split

The Command collection continues to require an exact supported external CLI version and only supplies diagnostic install guidance. Buildr-owned sidebar fragments remain Component members, while the upstream Skill bodies are refreshed from the upstream release and kept unmodified in workspace source.

Alternative considered: embed the CLI or merge Buildr directions directly into upstream Skill files. Rejected because this would blur ownership, prevent independent upstream integrity validation, and violate the existing Component contract.

### Split guard ownership at the upstream boundary

Let OpenSpec 1.6.0 own delta parsing, duplicate/cross-section validation, target Requirement existence, rebuilt-spec validation, and the archive-time check that a `MODIFIED` block does not drop current scenarios. Remove equivalent parsing and archive-safety logic from `openspec-contract-guard` instead of maintaining a second validator.

Retain the Buildr-specific guarantees that upstream does not provide: proposal capability/delta/baseline alignment, baseline snapshots, full canonical Requirement drift detection, conflicts across active changes, pre-sync receipts for the agent-driven `sync-specs` workflow, and post-sync verification of intended and untouched Requirements. Version consistency belongs primarily to package/Component verification; the guard only fails closed when runtime inputs do not match the already evaluated integration version.

Alternative considered: remove the guard entirely because archive safety improved. Rejected because upstream still does not reason across active changes, preserve a creation-time baseline, or produce pre/post evidence for Agent-authored canonical sync.

### Keep sidebar contributions small and do not create per-sidebar contracts

Retain `propose` worktree routing, `apply` Candidate/checkbox evidence, the task-triage proposal gate, and Task Finish pre/post-sync gates. Consolidate or delete repeated `status`/`changeRoot` path instructions from `explore`, `sync`, and `archive` when the 1.6.0 upstream Skill already provides the same guarantee.

These contributions remain Component-owned fragments, not interchangeable providers. Do not create a capability contract for each sidebar. Existing `task-worktree`, `task-verification`, `git-task-integration`, `task-asset-review`, and `task-finish` contracts remain unchanged. A future `buildr.openspec-contract-safety` contract is justified only if the guard becomes replaceable or its absence must explicitly change consumer readiness.

Alternative considered: model every injected fragment as a capability. Rejected because no consumer selects among providers or depends on the fragments as independent result evidence; Component integrity and composition tests are the smaller correct mechanism.

## Risks / Trade-offs

- [Upstream `opsx:update` changes during its experimental period] → pin the integration to 1.6.0, retain upstream source/integrity evidence, and require a new evaluated Component release for later upstream versions.
- [Removing duplicate guard checks creates a coverage hole] → map each removed check to an executable 1.6.0 behavior test and retain Buildr tests for every cross-change/baseline/receipt guarantee.
- [The new Skill later transitions into implementation without isolation] → keep a minimal sidebar that requires a fresh task-worktree decision before any code, build, or test action.
- [A component update overwrites user-modified members] → rely on the existing Component three-way comparison and integrity checks; do not weaken lifecycle protections for this release.
- [Stores are accidentally treated as a supported path because the CLI exposes them] → omit Store assets and state the non-support boundary in the integration specification and user-facing workflow guidance.

## Migration Plan

1. Update the Product source in an implementation worktree after this change is apply-ready.
2. Refresh all upstream-owned OpenSpec assets from exactly 1.6.0; update Buildr-owned metadata, sidebars, guard support, and package targets together.
3. Run focused integration, Component, runtime rendering, retained contract-guard, upstream archive-safety, and OpenSpec validation checks; run the final Product candidate verification only after the tree is frozen.
4. Release the new Component through normal Buildr package/update paths. Existing workspaces continue to use 1.4.1 until the user intentionally updates Buildr; Buildr does not mutate their local external CLI.
5. If any compatibility check fails, retain 1.4.1 as the supported integration and revert the candidate source changes before release.

## Open Questions

- Should `buildr.openspec-contract-safety/v1` be introduced later if OpenSpec safety becomes a replaceable provider or an independently uninstallable dependency? It is explicitly not required by this upgrade.
