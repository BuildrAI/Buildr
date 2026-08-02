# 解除 Task Environment controller identity 冻结

## 一句话摘要

让 Task checkout/provider evidence 决定 Environment 的源码版本，把 retained Buildr 收窄为 clean 的可信 Environment Manager，并移除 controller hash 对资源与验证证据的第二套 authority。

## 背景与问题

当前实现把 Receipt 创建时的 controller content identity 同时用于 Environment ready、Preview ownership 与 Verification evidence identity。retained Workspace 从 M1 正常前进到 M2 后，即使 Task checkout 仍稳定停留在 M1，也会被误判为 controller drift；旧方案进一步尝试自动 handoff identity，仍然把 manager 版本误当成 Task lifecycle generation。

## 目标与非目标

目标是由 Task checkout/provider evidence 表达 Task 的版本基础；retained Buildr 只证明 manager source clean、sourceRoot/adapter 可信且不是 candidate mutation入口。controller identity若保留，只表示创建 Receipt 的实现指纹。

非目标是不增加 Environment update/rebase、rebind、generation/revision/history、确认或状态机；不让 Environment 自动同步源码；不修改 Task Finish 的 `.buildr/` clean 判定。

## 受影响用户或角色

- 使用 Task Environment 准备、恢复、检查、登记资源与清理 Buildr 自举任务的 Agent。
- 作为可信 Environment Manager 的 canonical retained Buildr。
- 消费 Task Environment 的 Local App Preview、Task Verification 与 Task Finish。

## 核心流程

首次 `prepare` 先确认 Git-backed retained manager 的实际源码 clean，再创建 Receipt/checkout。后续 retained Workspace 升级只让新 manager 对原 Task checkout/provider、candidate CLI、依赖、projection 与资源做真实 probe，不比较或改写 Receipt 创建指纹。Task 只有通过 Development/Finish 的显式 Git 操作才吸收 M2；Environment 本身不 fetch/rebase。

## 关键变化

- manager clean path 只包含 `bin/`、`src/`、`package/`、`package.json`、`package-lock.json`，覆盖 staged、unstaged、untracked，排除 `.buildr/`。
- 删除 controller content drift、自动 handoff 与 `controller-handoff` effect；existing Receipt identity保持创建时值。
- candidate Buildr 可只读 inspect，但不能 prepare、认领/释放资源或 cleanup。
- Preview ownership 使用 Task/Workspace/Environment/resource/provider identity/handle。
- Verification applicability 使用 Candidate、policy、Environment/execution、Runtime/CLI/依赖/projection、Workspace Node 与 checks；Task Finish prepare/recovery input identity 也不纳入 Receipt 创建指纹。

## 影响、风险与兼容性

Git-backed dirty manager 会在 mutation 前 blocked；`.buildr/` metadata 不影响门禁。已有 Receipt/Preview schema不迁移，旧 controller 字段兼容保留但不参与决策。retained manager 升级不再自动使 Environment 或 Verification broken；Task checkout、Candidate、projection、dependencies 或 resource facts真实变化时仍会重新判断。

## 验收摘要

- dirty retained manager 的首次 prepare 对 staged、unstaged、untracked 均零持久效果，`.buildr/tasks/**` 不影响 clean/指纹。
- retained M2 可继续 inspect/prepare/resource/cleanup 停留在 M1 的 Task checkout，不 handoff、不改写 identity、不 rebase。
- dirty manager、candidate mutation、sourceRoot/adapter mismatch继续 blocked；candidate 只读 inspect可用。
- Preview 与 Verification 不再消费 controller hash 作为 ownership/applicability。
- Task Environment、Preview、Verification 受影响测试、OpenSpec strict、正式验证与 Doctor 通过。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Environment delta](specs/task-environments/spec.md)
- [Task Verification delta](specs/task-verification/spec.md)
- [Implementation tasks](tasks.md)
