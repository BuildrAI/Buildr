# Buildr Product 当前认知

本文是 Buildr Product 已实现当前事实的入口。产品定位和解释见 [Buildr Product](../../docs/buildr-product.md)，规范行为以 [canonical specs](../specs/) 和 active Change delta specs 为准。

## 当前产品

Buildr 是 Agent-first 的工作基础设施：治理适合长期复用的工作事实与工作方法，为 Agent 提供可发现入口、runtime 投射、确定性状态变更、完整性保护和诊断。Agent 仍负责理解目标、发现信息、形成 Task Context、推理并执行专业任务；人负责目标、业务判断、授权和重要决策。

当前默认层级为 `Organization/Root → Project → Service`。Workspace 是工作范围与发现入口；其中只有被明确组织、登记或纳入治理的长期事实与方法才是 Buildr Work Assets。

## 当前能力入口

- Workspace、Project、Service：由 manifests/registries 表达稳定 identity、关系和 source ownership。
- Rules、Skills、Commands、Components：由 workspace manifests 治理并按 runtime adapter 投射。
- OpenSpec：在 Product Project 管理 proposal、design、delta specs、tasks、contract baseline 和 active/archive lifecycle。
- Task workflow：正式持久交付在首次写入前通过 `task-manager` 创建或恢复 canonical Task Record，再由 `task-environment` 按同一 Task ID 准备或恢复实际执行根、Workspace Node/CLI/依赖、runtime projection、动态资源和 cleanup authority。`task-review` 在两个可选 current 槽位记录 Planning/Completion Review；`task-verification` 读取 Project `verification.yml` v2、执行显式已有 capability，并通过唯一 Application 维护一个 current Verification Result。Result 绑定 target 与 declaration identity，读取时派生 `current / stale / unknown`，不保存推进决定或 Candidate generation。Git checkout 由窄 `task-worktree` provider 提供 evidence；各专业模块不把内容复制进 Task Record。
- Local App：以 Workspace 为全局目录，提供 Project、Service、Task Record 和 Change 的理解与受控操作入口；Task 详情包含独立只读“环境”“审查”“验证”页签，并可按 Task 范围读取未集成 Change。审查页签展示两个 Review Result 槽位；验证页签展示一个 current Verification Result、applicability、能力事实和 coverage gaps；两者都只生成受限 Agent action，不提供第二 writer。人可以管理 Task Record，但 Environment prepare/cleanup、Review/Verification 执行、Change lifecycle 和其他专业动作仍交给 Agent/对应模块。

## 当前认知导航

- [术语表](glossary.md)
- [架构入口](architecture/index.md)
- [产品架构](architecture/product.md)
- [技术架构](architecture/technical.md)
- [OpenSpec Change 生命周期](flows/openspec-change-lifecycle.md)
- [Buildr Service](services/buildr.md)

`task-boards/` 是 task-scoped working knowledge；既有 `task-cockpits/` 是保留的历史任务页面。它们都不替代 current knowledge、canonical specs、active Change、实现或验证 evidence。
