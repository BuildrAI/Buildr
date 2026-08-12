# Formalize Git Operations

一句话摘要：Buildr 用一个 Skill-only Git Operations 入口统一执行已选定 Git Operation 时的安全默认值、硬边界和最小 evidence，并删除三条冲突旧能力。

## 背景与问题

现有 `git-ops` 同时提供单项操作、任务集成和 workspace update 三项重叠 contract；其中任务集成已无真实 consumer，另外两项仍被 Task Finish 和 Buildr 产品入口使用。旧 Skill 还把自动 rebase、完整命令路由和意图编排混在 provider 内，违反生命周期架构“宽而薄”和 consumer 决定动作/顺序的边界。

## 目标 / 非目标

目标是交付唯一 `git-operations` / `buildr.git-operations/v1`，覆盖明确输入与授权、精确暂存、commit/push 分离、前后 identity、完整 push range、共享 commit 冻结、最小 Result 与 fail-closed 部分失败。

非目标是不建设 Git 平台、Application、CLI、Receipt、持久状态或通用 transaction；不扩展完整命令集，不自动 stash/reset/rebase/merge/force push，不实现 P0.7 或扩展 P0.8。

## 受影响用户或角色

- 直接要求 Agent 执行明确 commit、push 或组合动作的用户。
- 选择 operation/target/order 的上游 consumer，当前包括 Buildr 产品入口与 Task Finish retained metadata-only handoff。
- 替换 builtin provider、依赖 capability readiness 的 Workspace 维护者。

## 核心流程

1. 用户或 consumer 明确 repository、operation、ref、scope 和授权。
2. Git Operations 观察 operation 前 identity；输入不足或事实不符时零写入 blocked。
3. provider 只执行所选 operation：commit 精确暂存，push 校验完整 publication range；组合由 caller 顺序调用。
4. provider 返回 operation 适用的前后 identity、变化维度、effects 和 succeeded/blocked reason；失败不自动换策略。
5. consumer 决定后续恢复、重试、sync 或交付步骤。

## 关键变化

- 新增唯一 `git-operations` Skill 和 `buildr.git-operations/v1` contract/default binding。
- 迁移 Task Finish optional dependency 与 Buildr Skill 动态 routing。
- 删除 `git-ops`、`git-single-operation`、`git-task-integration`、`git-workspace-update` 的 active contract/binding/router/test 双轨。
- `git-worktree-provider/v1` 继续作为 Task Environment 的独立窄 provider。

## 影响 / 风险 / 兼容性

这是 capability identity 的 breaking cutover；自定义旧 provider 需要显式迁移到新 contract。完整 push range 和共享冻结会阻止一部分旧流程中的隐式发布或历史改写，这是预期安全门禁。Skill-only 无确定性 Git engine，保证强度由 contract、playbook、静态/System tests 和真实临时仓库验证共同提供。

## 验收摘要

- 默认 capability graph 只有一个 Git Operations 入口，旧 IDs active residual 为零，worktree provider 独立。
- 明确覆盖独立 commit、独立 push、commit+push、无关 dirty、scope 外 unpublished commits、push rejection、共享冻结与部分失败 evidence。
- focused、affected、完整 Candidate verification 全部通过。
- 集成后 retained Product source 完成 Codex sync，Doctor 与 capability graph 证明新入口生效。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Agent task workflow delta](specs/agent-task-workflows/spec.md)
- [Product Agent Skill delta](specs/product-agent-skills/spec.md)
- [Package asset delta](specs/buildr-package-assets/spec.md)
- [OpenSpec integration delta](specs/openspec-upgrade-integration/spec.md)
- [Tasks](tasks.md)
