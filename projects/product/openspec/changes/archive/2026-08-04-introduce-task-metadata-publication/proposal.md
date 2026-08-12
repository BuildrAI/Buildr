## Why

P0.1 至 P0.6 已分别建立 portable Task records 与唯一 Git Operations，但这些 canonical Workspace metadata 仍没有独立、可验证的共享边界。现在需要用一个宽而薄的发布能力，把一个明确 Task 的真实 writer-owned exact paths 单独 commit/push，同时避免把本机状态、Candidate、Finish 或其他 owner 内容带入 Git。

## What Changes

- 新增唯一入口 `task-metadata-publication` 与 capability `buildr.task-metadata-publication/v1`；required 消费 `buildr.git-operations/v1`，不新增公共 Application 或 CLI。
- 让 Task Record、Development、Verification 与 Review writer 分别声明自己的 portable exact owned paths；缺失的可选记录保持缺失，Environment 与其他本机/控制记录不可发布。
- 新增最小确定性 helper，在 Git 写入前后核验 canonical Workspace、Task identity、普通文件/目录边界、exact file set 与 bytes snapshot，revision drift 时 fail closed。
- 把 commit 与 push 保持为两个独立 Git Operations；push 前核验完整 unpublished range，保留 commit 成功/push 失败的部分 evidence，并允许安全复用内容等价的未共享 metadata commit。
- 明确无 Git Workspace 返回 `local-only / not-applicable`，publication 失败不改写 Task、Development Candidate、Finish evidence 或 terminal status。
- 不恢复 `git-workspace-update`、`git-task-integration`、`git-single-operation`，不把 Task Finish retained metadata-only handoff 当成 publication，也不加入 Board、Retrospective 或 P0.8 effects。

## Capabilities

### New Capabilities

- `task-metadata-publication`: 定义一个明确 Task 的 canonical portable exact-owned-path metadata publication、snapshot/drift、Git Operations 调用、重试和失败边界。

### Modified Capabilities

- `task-record`: 由真实 Task Record writer 声明 `.buildr/tasks/<task-id>/task.yml` 的 publication eligibility 与 reference diagnostic 边界。
- `task-review-results`: 由真实 Review writer 声明 planning/completion 两个可选 portable exact owned paths。
- `task-verification`: 由真实 Verification writer 声明 `verification.yml` 的 portable exact owned path。
- `task-development`: 由真实 Development writer 声明 `development.yml` 的 portable exact owned path，并保持 Candidate 与 metadata publication 分离。
- `agent-task-workflows`: 增加唯一 Skill 路由、required Git Operations binding 与 Task lifecycle authority 边界。
- `buildr-package-assets`: 发布并验证新 Skill、contract、helper、provider/binding 和 runtime projection 资产。

## Impact

- Product specs、roadmap/current knowledge 与 OpenSpec Brief。
- Buildr package manifest、workspace Skills baseline、bootstrap/CLI/skill capability docs 与 Codex 等 runtime 投射。
- 四类 portable record writer 的 ownership declaration，以及 publication helper 的静态、集成和 Git fixture tests。
- 不新增公共 CLI/HTTP API，不修改 Task Record/Review/Verification/Development schema，不修改 Environment、Candidate、Finish 或 Task terminal authority。
