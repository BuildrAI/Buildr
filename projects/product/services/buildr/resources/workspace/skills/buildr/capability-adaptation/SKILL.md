---
name: capability-adaptation
description: 用户要求采用内部流程、调整工作方式、修改默认 Skill 行为、创建或替换专业 Skill、卸载可能被编排的 Skill，或 Agent 准备改变 provides、requires、capability contract、binding 及跨 Skill 协作边界时使用；负责从自然语言意图完成影响分析、候选开发、组合验证、安全激活和 runtime 同步，不要求用户理解 capability 术语。
---

# 工作能力适配

本 Skill 承载 Agent 工作能力适配（Agent-managed Capability Adaptation）。用户只拥有工作意图和关键决策；Agent 维护工作资产；Buildr 维护依赖结构和 runtime 投射；capability contract 只保护跨 Skill 最小协作边界。

## 1. 建立影响基线

- 解析 Buildr workspace、实际 scope 和当前 Agent，运行 `buildr doctor --agent <agent> --target <workspace> --json`。
- 读取目标 Skill 源、`skills/manifest.yml`、相关 contracts、当前 bindings 和 doctor `capabilities` graph；同时区分 Agent runtime 基于 description 的入口发现与 Skill 加载后的 dependency resolution。routing evidence 存在时，只在对应产品入口已经命中的前提下检查其内部用户意图覆盖。
- 列出目标 Skill 提供的 capabilities、直接/递归 consumers、required/optional mode、当前 selected provider 和修改后的 blocked/degraded 风险。用户无需知道这些资产名称。
- 修改 Buildr builtin 时不得直接编辑用户 workspace 中的受管副本；组织差异使用组织自有 provider，Buildr 产品行为变化走产品 change。

## 2. 判断如何落地

按以下顺序选择最小变化：

1. 只属于单个 Skill 内部，且不被组合、不需替换、consumer 不依赖稳定保证或结果证据、生命周期无需影响诊断：普通 Skill 维护，不创建 contract。
2. 触达已有 contract 且变化位于 `Allowed Variations`：修改用户自有 provider，或为 builtin 创建组织 provider；保持 contract identity 和 guarantees。
3. 另一工作流无法在缺少该能力的稳定保证或结果证据时安全继续、需要替换实现，或生命周期需要影响诊断：创建最小 contract 和 `provides`/`requires`。不要因为 Agent 执行时会同时读取多个 Skills，就把它们建模为方法调用依赖。
4. 新行为突破既有前置条件、副作用、授权、结果证据或失败语义：升级 contract major version，或同步修改 consumers；不得把不兼容实现继续声明为旧版本 provider。

判断的是稳定协作边界，不是用户是否说出 capability 名字。命令、算法、merge/rebase policy 和组织工具留在 provider；只有 consumer 无法安全继续时依赖的保证进入 contract。

## 3. 先开发候选，再改变当前实现

- 在 canonical task worktree 或任务候选目录中修改或创建 Skill，记录当前 provider、binding 和 source integrity；不得先卸载或覆盖当前有效实现。
- 为候选写清触发 description、职责边界、授权/停止条件和结果证据。实现既有 contract 时逐项核对 contract；新增 contract 时使用最小 frontmatter 和固定语义章节。替换顶层入口 capability provider 时，必须验证新 provider 的 description 覆盖原用户意图，并检查旧入口或其他 Skill 是否造成触发歧义；binding ready 不能替代这项验证。
- 运行 Skill frontmatter/package 静态检查、provider 专项测试和每个受影响 consumer 的组合场景。`ready` 只表示结构可路由，不能替代行为证据。
- 候选不满足 contract、组合验证失败或计划会产生用户未接受的 blocked consumer 时停止；保留当前实现和 binding，向用户说明真正需要决定的语义差异。

## 4. 激活与恢复

1. 使用 `buildr skills add ... --provides/--requires` 或 `--replace` 写入已验证候选；不要要求用户手改 manifest。
2. 安装新 provider 不会自动改变流程。确认候选可见后使用 `buildr skills bind <capability>@<version> --provider <skill-id> --scope <scope> --target <workspace>` 显式选择。
3. 在新 binding ready 之前不卸载旧 provider；一个 Skill 提供多个仍被使用的 capabilities 时，逐项检查后才能完整卸载。
4. 执行当前 Agent 的 `buildr sync` 或最小 scope render，再运行最终 doctor，核对受影响 consumers、runtime paths，以及已加载产品入口内部适用的 routing evidence。顶层入口发生替换时，同时确认 selected provider 已投射到 runtime，且入口 description 与激活计划一致。
5. 激活后出现新的结构 error 时，使用记录的旧 binding 恢复选择并重新 doctor；不得留下明知 blocked 的半完成适配。已经发生且无法安全自动恢复的外部副作用必须如实报告。

## 5. 面向用户交付

默认只说明：用户要求的工作方式、实际生效 scope、Agent 修改或创建了什么能力、哪些现有工作流已验证兼容、是否有需要决策的风险。provider、consumer、binding 和命令细节只在用户询问、存在歧义或发生阻塞时展开。

例如用户要求“改用 feature 分支并通过 PR 合入 dev”时，Agent 应发现 Git task integration 被 Task Finish 使用；若该变化仍满足现有 contract，则创建或修改组织 Git provider、验证 Task Finish 后激活，并向用户报告新实践和收尾能力仍可用，而不是让用户执行 capability 命令。

## Guardrails

- 不把“用户想改工作方式”机械等同于新建 contract。
- 不通过 Skill id、description 相似或安装顺序猜测 provider conformance。
- 不把产品入口 Buildr Skill 当成全局前置 dispatcher，也不把 capability binding 当成 Agent 首次 Skill 意图发现机制。
- 不让产品入口的某项 route blocked 扩大为整个 Buildr Skill blocked。
- 不修改 runtime 派生副本作为长期事实。
- 不以“能力适配”为名扩大用户对外部写入、远端改写或破坏性动作的授权。
