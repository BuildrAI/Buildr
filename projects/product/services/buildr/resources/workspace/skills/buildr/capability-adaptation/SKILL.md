---
name: capability-adaptation
description: 采用内部流程、调整工作方式、修改或替换技能行为，或变更能力声明与绑定时使用。
---

# 工作能力适配

本 Skill 承载 Agent 工作能力适配（Agent-managed Capability Adaptation）。用户只拥有工作意图和关键决策；Agent 维护工作资产；Buildr 维护依赖结构和 runtime 投射；capability contract 只保护跨 Skill 最小协作边界。

## 先判断协作影响

核对目标技能（Skill）的源文件、用户期望及现有声明，判断变化是否影响跨技能协作保证、能力声明、绑定或激活。内部文字、结构或操作说明整理且不改变这些边界时，直接维护源文件并做相关检查，不要求完整依赖图或诊断。

修改 Buildr 内置资产时，只修改产品源文件并走产品变更；组织差异使用组织自有提供者（Provider），不直接编辑受管副本。

## 判断如何落地

按以下顺序选择最小变化：

1. 只属于单个 Skill 内部，且不被组合、不需替换、consumer 不依赖稳定保证或结果证据、生命周期无需影响诊断：普通 Skill 维护，不创建 contract。
2. 触达已有 contract 且变化位于 `Allowed Variations`：修改用户自有 provider，或为 builtin 创建组织 provider；保持 contract identity 和 guarantees。
3. 另一工作流无法在缺少该能力的稳定保证或结果证据时安全继续、需要替换实现，或生命周期需要影响诊断：创建最小 contract 和 `provides`/`requires`。不要因为 Agent 执行时会同时读取多个 Skills，就把它们建模为方法调用依赖。
4. 新行为突破既有前置条件、副作用、授权、结果证据或失败语义：升级 contract major version，或同步修改 consumers；不得把不兼容实现继续声明为旧版本 provider。

判断的是稳定协作边界，不是用户是否说出 capability 名字。命令、算法、merge/rebase policy 和组织工具留在 provider；只有 consumer 无法安全继续时依赖的保证进入 contract。

## 按影响验证与激活

仅当变化涉及跨技能协作、能力声明、绑定或激活时，读取[依赖基线、候选验证与激活恢复](references/adaptation-lifecycle.md)，再执行对应动作。先核对现有协作保证，按实际影响选择专项检查和组合场景；不因普通正文修改机械执行所有消费者（Consumer）的检查。

本技能（Skill）不改变既有授权；当前有效实现、写入对象和恢复边界依参考文件保护。Buildr 自举工作空间的正式激活仍交给其唯一执行器。

## 面向用户交付

默认只说明：用户要求的工作方式、实际生效 scope、Agent 修改或创建了什么能力、哪些现有工作流已验证兼容、是否有需要决策的风险。provider、consumer、binding 和命令细节只在用户询问、存在歧义或发生阻塞时展开。

例如用户要求“改用 feature 分支并通过 PR 合入 dev”时，Agent 应发现 Git task integration 被 Task Finish 使用；若该变化仍满足现有 contract，则创建或修改组织 Git provider、验证 Task Finish 后激活，并向用户报告新实践和收尾能力仍可用，而不是让用户执行 capability 命令。

## Guardrails

- 不把“用户想改工作方式”机械等同于新建 contract。
- 不通过 Skill id、description 相似或安装顺序猜测 provider conformance。
- 不把产品入口 Buildr Skill 当成全局前置 dispatcher，也不把 capability binding 当成 Agent 首次 Skill 意图发现机制。
- 不让产品入口的某项 route blocked 扩大为整个 Buildr Skill blocked。
- 不修改 runtime 派生副本作为长期事实。
- 不以“能力适配”为名扩大用户对外部写入、远端改写或破坏性动作的授权。
