# Verification performance evidence

## Pre-implementation Core baseline

- Source tree: task worktree before Test Context or scheduler implementation changes
- Runtime: retained Node `24.15.0`
- Command: `npm run test:core`
- Result: passed, 52 steps
- Wall clock: 348,411 ms
- Cumulative executor work: 1,154,544 ms
- Effective parallelism: 3.31
- Steps over their declared target: 22

Slowest owners:

| Owner | Duration |
|---|---:|
| `system-task-finish` | 114,439 ms |
| `integration-task-development` | 93,787 ms |
| `integration-task-finish-delivery` | 84,250 ms |
| `system-workspace-lifecycle` | 66,950 ms |
| `integration-self-bootstrap` | 64,214 ms |
| `integration-task-execution-records` | 57,695 ms |
| `system-worktree-lifecycle` | 52,310 ms |
| `integration-task-coordination` | 50,937 ms |
| `concurrent-task-acceptance` | 46,204 ms |
| `runtime-adapter-parity` | 43,232 ms |
| `system-task-lifecycle` | 43,166 ms |

The runner prepared the Task lifecycle seed for every System owner, including owners whose files never acquire that Context. Observed unnecessary setup included `system-public-json-contracts`, `system-verification-contracts`, `system-openspec-contract-audit`, `system-app-process`, `system-workspace-lifecycle`, `system-runtime-recovery`, `system-worktree-lifecycle`, `system-task-finish`, and `system-task-finish-cli`; each paid roughly 0.66–0.97 seconds before its test body.

## Evidence responsibility audit

| Owner group | Primary evidence | Decision |
|---|---|---|
| Task lifecycle HTTP, Review, Verification and Task Record owners | Real CLI/HTTP, SQLite and Workspace projection | Reuse one immutable Task seed; preserve an isolated writable sandbox per case. |
| Task Development and Execution Record integration | Real SQLite migrations, persistence and current-result reconciliation | Keep Integration. Existing owner-local templates already amortize setup; do not relabel them Component merely because they run in one process. |
| Task Finish core/delivery and System Finish | Git refs/remotes/worktrees, retained target, carrier, cleanup and delivery recovery | Keep the real Integration/System boundaries and unique golden journey. Control concurrency; do not replace these facts with mocks. |
| Workspace/Worktree lifecycle and self-bootstrap | Initialization, checkout, retained activation and cleanup are the behavior under test | Keep full lifecycle recreation. They may consume shared read-only product inputs, but not a pre-created mutable Workspace that skips the tested boundary. |
| System owners without Task fixture consumers | Their own CLI, static, runtime or lifecycle contract | Remove the unconditional Task Context setup tax. |
| Component layer | Bounded Application assembly with fake/in-memory external ports | Add Context adapter coverage and use this boundary for future pure Task rules; no existing SQLite/Git primary owner is silently downgraded in this Change. |

The baseline proves that seed reuse alone cannot reach 180 seconds: the single Finish golden journey consumes 114 seconds and cumulative work exceeds 19 minutes. This Change therefore treats Context reuse and hierarchical concurrency as framework correctness, reports their measured benefit, and leaves irreducible golden-path cost as an explicit residual instead of deleting evidence.

## Implemented execution architecture

- `test/context/` now owns a runner-independent Pool/Context/Sandbox Lease protocol. `task-lifecycle/v1` is prepared once per plan, projected to child runners, inspected by tree identity, materialized into case-owned sandboxes and released fail closed.
- Context integration coverage includes unknown provider, projection/marker mismatch, seed mutation, realpath alias, idempotent release and cleanup failure. A thin `node:test` adapter owns worker-local cleanup for direct file execution.
- The registry and planner now close `contexts`, isolation/reset, parallel safety and numeric demand. The DAG scheduler grants workers/processes/Git/workspace I/O capacity atomically; the executor derives the inner worker budget from that grant.
- Only actual Task Context consumers declare it. Unrelated System owners no longer pay an unconditional seed setup. A bounded Task terminal-delivery Application test moved from Unit to Component; real SQLite, CLI, Git, Workspace, Finish, self-bootstrap and Acceptance owners remained at Integration/System.
- A closeout audit found and removed a stale reference to the deleted `verification-node-runtime.test.mjs`. A new contract fails if any explicit `node-test` selector does not resolve to a real file.

## Focused Context evidence

Two independent focus runs selected `integration-runtime` and `system-task-lifecycle` and passed in 11,194 ms and 9,809 ms. Each run prepared exactly one outer `task-lifecycle/v1` seed (about 0.65 seconds), both owners reused the same identity, and every case received a separate sandbox. The execution grant was workers=2/processes=2; Context consumers did not create a second seed.

The focused and contract suite passed 139 tests covering Context runtime, registry/planner/scheduler, worker-budget propagation, Task Component placement, timing evidence and resource coordination. A separate worker-budget=1 regression passed 10/10, proving npm and `node-test` executors do not inherit an unrelated nested budget.

## Post-implementation Core evidence

Three clean, non-contention 52-step Core runs on the same source tree all passed:

| Run | Wall clock | Cumulative executor work | Effective parallelism | Steps over target |
|---|---:|---:|---:|---:|
| 1 | 333,413 ms | 1,105,610 ms | 3.316 | 20 |
| 2 | 337,109 ms | 1,119,407 ms | 3.321 | 21 |
| 3 | 307,395 ms | 1,017,204 ms | 3.309 | 20 |
| Median | **333,413 ms** | **1,105,610 ms** | **3.316** | **20** |

Every run recorded one Task Context prepare, 14 cross-runner reuses, 49 sandbox materializations and 49 successful releases. Compared with the 348,411 ms baseline, the median wall-clock improvement is 14,998 ms, about 4.3%; median cumulative work falls by 48,934 ms, about 4.2%. The range is 29,714 ms. This is a real but deliberately modest first-provider benefit, not evidence that the whole lifecycle problem is solved.

The current 52-step plan declares 976,000 ms of target work, a 244,000 ms global-capacity lower bound and a 360,000 ms Core budget. The actual clean median is within that current budget but remains 153,413 ms above the Parent's 180-second optimization target.

Residual long-tail owners remain the real cost center: `system-task-finish` is roughly 99–109 seconds, `integration-task-development` 83–97 seconds, `integration-task-finish-delivery` 72–82 seconds, and Workspace/self-bootstrap/execution-record owners remain roughly 48–71 seconds. Their initialization, Git, delivery, cleanup or migration boundaries are primary evidence; this Change does not replace them with mocks or delete their golden paths.

## Core/affected contention evidence

A Core run and an affected run for `src/task/application/task-development-application.mjs` started concurrently and both passed:

| Execution | Wall clock | Cumulative work | Effective parallelism |
|---|---:|---:|---:|
| affected, 11 steps | 105,736 ms | 190,886 ms | 1.805 |
| Core, 52 steps | 389,761 ms | 1,128,276 ms | 2.895 |

The affected `integration-task-development` acquired `task-lifecycle-heavy` after 5 ms and ran for 101,397 ms. Core `system-task-finish` waited 97,629 ms for the same cross-plan resource, then ran for 104,324 ms; its `task-lifecycle-heavy` and `workspace-saturating` leases were both recorded as released. Core self-bootstrap separately waited 53,230 ms for workspace capacity. Thus the 56-second increase over the clean Core median is explainable as coordinated waiting/competition rather than hidden shared mutation. Both plans prepared their own plan-scoped seed, all Task sandboxes released successfully, and no retained Context was shared across plans.

Existing coordinator tests additionally cover timeout/cancellation, stale ticket recovery and subsequent rerun. The stress run supplies the missing live proof that Full/affected executions actually wait and release under the declared resource identities.

## Candidate and Release responsibility

The final registry still selects 66 Candidate steps. Its plan declares 1,338,000 ms of target work, a 334,500 ms global lower bound and a truthful 600,000 ms budget. Candidate continues to contain the unique tarball producer and the local application payload, Launcher, onboarding and tarball smoke consumers. Hosted Windows, Host Node, npm integrity, protected Candidate aggregate and release readback/convergence remain separate CI/Release responsibilities established by the previous Contribution; membership and workflow contracts passed. No second tarball or release flow was introduced.

## Result and next optimization boundary

Task 3 delivers the missing execution architecture and makes concurrency/Context costs observable and enforceable. It does not reach 180 seconds. The next performance work should be evidence-led provider migration (for example SQLite snapshot or narrowly scoped immutable Git/source seeds) and product/fixture optimization inside the four residual long-tail owners. Each migration must first identify repeated setup that is not itself the primary fact under test; increasing global concurrency or changing to Vitest alone is not a valid remedy.
