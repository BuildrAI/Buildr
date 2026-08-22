## Context

当前 Task Entry Snapshot 在 active Task 缺少 Environment Receipt 时把 `prepare` 标记为 `required`；`task-triage`、OpenSpec sidebar 与 Task Development 又把该结果扩展为所有正式修改、构建和测试的许可门禁。这能保护 Buildr-managed worktree、Preparation、runtime projection和资源，但也错误阻塞了 Agent 在用户已授权、repository/target/ownership 均明确时直接工作。

Finish 侧已经具备自动交付和 `task finish reconcile` 两条入口，也已经把 Delivery、Activation、Environment Cleanup 与 Diagnostics 分开投影；遗留耦合在于交付对账仍以 ready Environment repository set 作为唯一执行上下文。这样一来，外部 Git/PR 已真实交付但 Environment 不存在、已清理或局部损坏时，Buildr 无法只根据 current immutable handoff、Task scope、registry/Git 与 remote facts重建 Delivery。

本变更同时处理入口与出口：Environment 回归受管执行资源 owner；Delivery Reconciliation 回归真实交付结果 owner。Development/Verification 外部证据导入属于后续 `development-evidence-flow`，本变更不提前实现。

## Goals / Non-Goals

**Goals:**

- 让 Environment `required` 只保护实际消费其 checkout、Preparation、runtime、持久资源或正式环境 evidence 的动作。
- 让没有 Development current 的 active Task 在 Environment 缺失时仍得到可操作的 `recommended prepare`，而不是全局工作许可 blocker。
- 保持已绑定 Environment 的 Development/Finish 受 identity、allowed roots、repository set 与 cleanup ownership 约束。
- 让外部 Git/PR Delivery Reconciliation 在没有 ready Environment 时，可从 current handoff、Task scope、Project/Service registry、真实 Git topology 与 remote ref构造最小 delivery context。
- 自动 Finish 与 reconciliation 保存同形逐 repository Delivery、完成同一 Task Record terminal transition，并独立投影 Activation、Cleanup、Diagnostics。

**Non-Goals:**

- 不在本变更中实现外部 Verification Result 导入、任意目录 adoption 或无 Development handoff 的完成声明。
- 不允许直接工作冒充 ready Environment，不为外部执行补造 Receipt、Plan、Candidate、Review 或 Verification。
- 不改变共享历史、force push、remote ambiguity、Task Contribution containment 与安全删除的硬门禁。
- 不重构 Buildr Web 展示，不新增生命周期状态、全局 gate registry 或第二套 Delivery store。

## Decisions

### 1. 将 Environment admission 拆成“建议准备”和“受管动作必需”

Task Entry Snapshot 在 Task active、Development current 不存在且 Environment receipt 缺失/未登记 Plan时返回整体 `ready`、空 blocker和 `recommended task-environment prepare`。若调用方选择 OpenSpec managed flow、Task Development begin、formal Verification、自动 Finish、Task-owned resource 或 Environment cleanup，实际 owner contract仍重新检查 matching ready Environment并在本动作前 fail closed。

若 Development 已保存 matching Environment identity，而 Environment 随后 drift、blocked 或丢失，Snapshot继续返回 `required`：此时继续写 Development/Candidate/Handoff可能造成错误 source identity或完成误报，不属于可安全降级。

未采用方案：完全删除 Environment admission。该方案会失去 checkout ownership、并发占用、candidate projection 和 cleanup 安全边界。

### 2. Skills 明确区分直接工作与 Buildr-managed formal evidence

`task-triage` 不再把 Formal Task Record 本身解释为必须准备 Environment 的授权门槛。Agent可以在用户已授权且repository、ref、owned scope、外部副作用明确时直接编辑或运行有界测试，并如实报告这不是 Buildr-managed Environment/Verification evidence。

一旦用户目标要求 OpenSpec candidate、Task Development、Formal Verification、自动 Finish、持久资源或可由Buildr清理的环境，Skill必须进入 Environment owner；不能用聊天声明或当前目录替代 Receipt。

未采用方案：为“直接模式”新增 Environment Receipt disposition。该方案会把“不使用 Environment”重新建模为 Environment authority，并制造第二种虚假 ready。

### 3. Reconciliation 使用独立 delivery context resolver

自动 Finish 保持使用 Environment repository set，因为它需要隔离 source checkout与Delivery Carrier。`task finish reconcile` 改为优先复用 current ready Environment；不存在时，从以下权威事实构造只读 delivery context：

1. current immutable Development handoff与冻结 Task Contribution selectors/identities；
2. Task Record 的 Project/Service scope；
3. canonical registry声明与实际 Git boundary；
4. Agent明确选择或唯一解析的remote/target branch；
5. 真实remote ref readback与Git tree/containment计算。

resolver只产生本次Application输入，不写Receipt或新store。selector、source、remote、target或贡献不能唯一对应时，只阻塞对应repository及Task terminal completion，不接受调用方 claimed success。

未采用方案：恢复或补造 Environment Receipt。Delivery observation不拥有依赖准备、runtime projection、资源或cleanup authority，补造Receipt会污染权威边界。

### 4. Delivery terminal 与维护结果继续正交

全部 applicable repositories 的 Delivery 证明成立后，reconciliation立即通过Task Record Application完成Task，并保存与自动Finish同形的terminal delivery projection。Activation、Environment Cleanup和Diagnostics分别为`passed | pending | attention | not-applicable`；缺少Environment时Cleanup为`not-applicable`或`attention`，不得伪造`cleaned`。后续 owner可用已有maintenance reconciliation刷新事实，但不能改写Delivery。

多repository逐项保存：一个repository未证明时，不撤销其他repository已成立的delivery checkpoint；Task completed仍等待全部applicable repositories成立。

### 5. 迁移采用兼容读取和原地行为切换

不新增SQLite schema。现有Environment Receipt、Finish run/terminal Result与Task Record继续兼容读取。变化只影响Snapshot分类、Skill guidance、reconciliation context resolution和Result投影。旧自动Finish run继续使用原Environment identity恢复；新resolver不接管其carrier或resume token。

回滚时可恢复Snapshot分类和reconciliation resolver选择，不需要数据迁移；已经确认的Delivery/Task terminal事实保持不可变。

## Risks / Trade-offs

- [Agent把直接测试误报为Formal Verification] → Skill必须明确直接工作只产生Agent/Git/测试事实；Development与Verification writer继续要求current identity和专业Result。
- [无Environment时repository解析错目标] → resolver要求Task scope、registry、实际Git boundary与remote/branch唯一一致；任何歧义在remote零写入、terminal零写入状态停止。
- [Snapshot recommended被旧consumer当作自动继续] → 增加contract/system tests，验证`recommended`不代表owner成功，managed actions仍由各自Application拒绝。
- [Delivery完成但Cleanup无Environment] → 明确投影`not-applicable/attention`并禁止声称cleaned；不创建或恢复Receipt。
- [改动范围扩大到Development重构] → 本Change只调整admission分类与现有handoff消费；外部Candidate/Verification reconciliation保留给后续Contribution。

## Migration Plan

1. 更新delta specs与Skills，先固定直接工作、受管动作和结果正交边界。
2. 修改Task Entry Snapshot分类并增加无Receipt、已有Development drift和managed owner拒绝的测试。
3. 抽取reconciliation delivery context resolver，保留Environment优先路径并增加无Environment的Task scope/registry路径。
4. 增加自动Finish与reconciliation同形结果、多repository局部失败和Delivery后maintenance attention测试。
5. 运行严格OpenSpec预检、affected验证和完整Task正式验证；无数据迁移。

## Open Questions

无。外部Development/Verification evidence导入由后续`development-evidence-flow`独立决定。
