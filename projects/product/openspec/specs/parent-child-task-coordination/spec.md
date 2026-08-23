# parent-child-task-coordination Specification

## Purpose

定义 Parent Plan、Contribution、Contribution Handoff、显式 reconciliation、派生 read model、最终集成验收与历史 opt-in 兼容模型。

## Requirements

### Requirement: Parent Plan 必须只保存协调事实
Buildr MUST 为 opt-in Parent Task 提供 closed Parent Plan，且只包含 outcome、architecture invariants、Contribution Map、dependencies 与 final acceptance；MUST NOT 保存 Child 状态/Result、完整 OpenSpec Requirement/delta、实现字段/文件清单、Markdown checkbox 或 lifecycle/progress 聚合。

#### Scenario: 创建无完整 Parent Change 的协调计划
- **WHEN** Agent为active Parent Task记录Parent Plan且Parent没有覆盖全部Child的OpenSpec Change
- **THEN** Application MUST保存内容派生identity与五类协调事实
- **AND** MUST NOT要求Parent持有Child delta或第二份执行进度

### Requirement: Parent Plan identity 必须独立于 Child 状态
Parent Plan identity MUST只由其协调内容派生；Child status、Verification、Change archive、Finish或canonical specs正常更新 MUST NOT改变Plan bytes或identity。

#### Scenario: Child 完成不使 Parent Planning Review stale
- **WHEN** Child从active进入completed且Parent Plan内容未reconcile
- **THEN** Parent Plan bytes与identity MUST保持不变
- **AND** 绑定该identity的Planning Review MUST继续current
- **AND** Parent Task MUST保持active

### Requirement: Child 必须独立交付并形成 Contribution Handoff
绑定Parent Contribution的Child Task MUST拥有自己的Task scope、窄OpenSpec Change、Development Target、Review、Verification和Finish，并在immutable Development handoff中保存planned、delivered、extra、residual、superseded、affected Contributions与唯一next action。

#### Scenario: Child 只交付部分计划范围
- **WHEN** Child Finish证明部分planned Contributions已交付且仍有residual
- **THEN** Contribution Handoff MUST分别保存delivered与residual
- **AND** Parent read model MUST NOT因Child completed推断全部planned范围已交付

### Requirement: Parent reconciliation 必须显式修改计划
跨Contribution、依赖、architecture invariants或final acceptance的实际范围变化 MUST通过expected Parent Plan identity保护的显式reconciliation保存；普通Child状态变化 MUST NOT触发自动reconciliation或双写。

#### Scenario: Child 提前覆盖后续 Contribution
- **WHEN** saved Child Contribution Handoff证明后续Contribution已部分或全部交付
- **THEN** Agent MUST显式reconcile Parent Plan以缩小residual或重分配delivered owner
- **AND** 系统 MUST NOT从代码、文件或canonical spec猜测交付事实

#### Scenario: 已创建 Child 范围被完全覆盖
- **WHEN** reconciliation确认一个active Child的全部Contribution已由其他Child交付
- **THEN** 对应Child MUST以superseded理由abandon
- **AND** MUST NOT伪装为completed

### Requirement: Parent progress 必须是专业事实的派生 read model
Parent Coordination Application MUST动态组合Task Record关系及已保存的Development/Finish专业事实，返回Child identity/status与planned/delivered/extra/residual/superseded facts、Contribution disposition和最终验收前置条件；MUST NOT复制结果回Parent Record或建立新cache/table/writer。

#### Scenario: completed Child 缺少可证明 handoff
- **WHEN** Child Task是completed但没有matching saved Contribution Handoff
- **THEN** read model MUST将对应Contribution标记为unproven
- **AND** MUST NOT扫描文件系统、Git或canonical specs补造delivery

### Requirement: Parent 最终完成必须显式验收
所有Child完成或abandon MUST NOT自动完成Parent。Parent MUST显式记录整体集成验收并通过适用Development/Review/Verification/Finish或明确no-change完成动作。

#### Scenario: 所有前置条件满足
- **WHEN** read model显示全部非superseded Contributions已得到可证明处置
- **THEN** 系统 MUST只返回final acceptance prerequisites satisfied
- **AND** Parent status MUST保持active直到显式完成操作成功

### Requirement: 历史 Task 必须 opt-in 共存
没有Parent Plan的历史Task MUST继续可读、可恢复、可更新、可完成和可放弃；系统 MUST NOT自动backfill Contribution、扫描历史Parent、改写旧Change/`tasks.md`或包含单Task专用迁移。

#### Scenario: 读取历史 Parent Task
- **WHEN** Parent具有Child关系但Development Receipt没有Parent Plan
- **THEN** coordination read model MUST返回legacy/absent模式
- **AND** 既有Task与专业动作 MUST保持可用

### Requirement: 同一规范变化必须只有一个 active Change owner
一个具体规范变化在同一时间 MUST只由一个active Change持有；Parent Plan和Parent自身Change MUST NOT复制Child Change的完整delta，Parent Change只可覆盖Parent亲自承担的集成实现或验收能力。

#### Scenario: 创建 Child 窄 Change
- **WHEN** Agent从Parent Contribution启动Child Task
- **THEN** Agent MUST从最新dev/canonical specs创建独立窄Change并检查active Change ownership
- **AND** MUST NOT继承Parent Change、worktree、Environment或Development facts

### Requirement: Parent Coordination 必须派生启动就绪事实
Parent Coordination Application MUST基于current Task、matching Environment、Development Parent Plan、Planning Review与saved Contribution facts派生response-only启动就绪投影；MUST NOT新增Parent状态、Receipt、Result、表、migration或progress writer。

#### Scenario: Parent 已可启动首个 Child
- **WHEN** Parent active、Environment ready、Development与Parent Plan current、Planning Review ready且已被Development消费，并存在依赖已满足的未分配Contribution
- **THEN** Application MUST返回`ready`和稳定排序的eligible Contributions
- **AND** MUST保持零effects且不得自动创建或绑定Child

#### Scenario: Parent Planning Review 尚未被Development消费
- **WHEN** Parent Plan的Planning Review current且ready，但Development planning gate尚未保存matching Result引用
- **THEN** Application MUST返回精确refresh blocker与Parent planning refresh next action
- **AND** MUST NOT把Review slot存在直接伪装成Development gate current

### Requirement: Parent planning refresh 必须安全消费current Review
Buildr MUST提供受控Parent planning refresh动作，只从saved Parent Plan、current planning snapshot与Task Review Application读取输入，并由Task Development Application保存matching planning gate；调用方MUST NOT提交或重构完整planning JSON、Review正文或gate引用。

#### Scenario: current Review被安全消费
- **WHEN** active Parent具有current Parent Plan，Planning Review target等于Plan identity且outcome为`ready`
- **THEN** refresh MUST保持planning target/nodes与Parent Plan bytes不变并保存current planning gate引用
- **AND** Result MUST返回Development writer effect与更新后的启动就绪事实

#### Scenario: Review或Plan identity漂移
- **WHEN** Planning Review缺失、stale、changes-required或target不等于current Parent Plan identity
- **THEN** refresh MUST在Development零写入状态返回blocked与唯一恢复动作
- **AND** MUST NOT接受调用方提供的旧digest、旧target或手工gate作为fallback

### Requirement: Eligible Contribution 必须只来自saved协调证据
Parent启动投影 MUST只把未分配、未交付、未superseded且全部依赖已由saved handoff证明delivered或明确superseded的Contribution列为eligible；MUST NOT从Task completed、Git、文件、Change或canonical specs猜测依赖完成。

#### Scenario: Contribution依赖尚未得到handoff证明
- **WHEN** 未分配Contribution依赖另一个仍为unassigned、planned或unproven的Contribution
- **THEN** 启动投影 MUST不把该Contribution列为eligible
- **AND** MUST返回精确dependency blocker

### Requirement: Parent Plan v2 必须结构化表达完整实施方向
Buildr MUST 让新 Parent Plan writer 只写 `buildr.parent-plan/v2`，并在每个 work item 中保存稳定 `id`、`priority`、`title`、`objective`、`directions[]`、`boundaries[]`、可空 `expectedChild` 与 `dependencies[]`；Plan 还 MUST 保存 `outcome`、`architectureDecisions[]` 与 `finalAcceptance[]`，并让全部结构化内容进入 Plan identity。

#### Scenario: v2 完整 round-trip
- **WHEN** caller 提交包含多项方向、边界、预计 Child、依赖、跨 Child 决策和最终验收的合法 v2 input
- **THEN** Domain 与 Application MUST 无损保存和读取全部字段
- **AND** identity MUST 由规范化后的完整 v2 内容派生

#### Scenario: dependency 非法
- **WHEN** work item 引用不存在的依赖、自依赖或形成 dependency cycle
- **THEN** writer MUST 在持久化前返回精确 blocked diagnostic
- **AND** MUST 保持 Development Receipt 零写入

### Requirement: Parent Plan v1 必须 dual-read 且只显式升级
Buildr MUST 继续按原始 v1 payload 与 identity 读取 `buildr.parent-plan/v1`，MUST 通过 compatibility projection 提供 v2 等价 read model，并 MUST 只通过 current expected identity 保护的显式 `reconcile` 把 v1 升级为完整 v2；系统 MUST NOT 在读取、启动、Web 展示或 SQLite migration 中自动 backfill 或写回。

#### Scenario: 读取 v1 Parent Plan
- **WHEN** Development Receipt 保存合法 v1 Parent Plan
- **THEN** inspect MUST 保持原 v1 schema/identity 可验证并返回 rich compatibility projection
- **AND** v1 `summary`、顶层 dependencies 与 `plannedChildTaskId` MUST 分别投影为可读 work item、work-item dependencies 与 legacy expected Child

#### Scenario: 显式升级 v1
- **WHEN** caller 以 current v1 identity 和完整 v2 input 执行 `reconcile`
- **THEN** Application MUST 保存新的 v2 Plan 与新 identity
- **AND** MUST 不修改 Task Parent/Child 关系、Contribution binding、handoff 或 live Task 之外的任何记录

### Requirement: Expected Child 与 Actual Child binding 必须正交
`expectedChild` MUST 只表达预计实施单元名称或目的，MUST NOT 改变 Contribution disposition、eligible calculation、startup readiness 或真实 Child ownership。Actual binding MUST 只由直接 Child Task 的 Parent 关系与 current Child Development Contribution binding 共同派生，delivery disposition MUST 继续只由 matching saved Contribution Handoff 证明。

#### Scenario: 只有 expected Child
- **WHEN** work item 保存 `expectedChild` 但没有满足关系与 Development binding 的真实 Child
- **THEN** read model MUST 返回 `expectation.status=expected` 与 `actual.status=unassigned`
- **AND** 依赖满足时 `eligibility.status` MUST 为 `eligible`

#### Scenario: 建立真实 binding
- **WHEN** 真实 Child Task 具有正确 Parent 关系且 current Development 绑定该 Contribution
- **THEN** read model MUST 返回 actual Child identity/title/Task status 与 `bound|active` actual status
- **AND** MUST NOT 依赖 Parent Plan 中的预计字段建立该状态

### Requirement: Parent work item read model 必须分离三类状态
Parent Coordination Application MUST 为每个 work item 分别返回计划预期、可启动性与真实绑定/交付处置；closed 状态 MUST 至少覆盖 `expected|none`、`eligible|waiting-dependency|not-eligible` 与 `unassigned|bound|active|delivered|residual|superseded|unproven`。Dependency blocker MUST 同时返回稳定 ID 与当前 Plan 中的人类可读标题。

#### Scenario: expected 且 eligible
- **WHEN** 未绑定 work item 具有 expected Child 且全部依赖已 delivered 或 superseded
- **THEN** 同一 read model MUST 同时表达 expected 和 eligible
- **AND** MUST NOT 通过单枚举丢失任一事实

#### Scenario: 等待依赖
- **WHEN** 未绑定 work item 仍依赖未交付 work item
- **THEN** eligibility MUST 为 `waiting-dependency`
- **AND** blockers MUST 返回依赖 work item 的 title 与 id，而不只返回内部 ID

### Requirement: Parent Coordination v3 必须消除重复但保留协调语义
Parent Coordination Application MUST 只在顶层`plan`返回Plan摘要，只在顶层`contributions`返回rich work items，并 MUST继续保留预期、可启动性与真实绑定/交付三个正交轴。Application MUST不返回`parentPlan`、`plan.contributions`、`finalAcceptanceReady`、work item `expectedChild`、Child `plannedContributions`、`startup.dependencyBlockers`或顶层`nextActions`。

#### Scenario: 读取v2 Parent Plan
- **WHEN** stored Parent Plan使用`buildr.parent-plan/v2`
- **THEN** v3 MUST在`plan`返回source schema、identity、outcome、architecture decisions与final acceptance
- **AND** 每个work item MUST只在顶层`contributions`出现一次

#### Scenario: 读取v1 Parent Plan
- **WHEN** stored Parent Plan使用只读兼容v1
- **THEN** v3 MUST保留原source schema与identity并返回rich compatibility work items
- **AND** MUST不自动写回、reconcile或嵌入第二份raw Plan

### Requirement: Parent Coordination v3 必须只嵌入专业摘要
Parent Coordination Application MUST先验证current Planning Review与matching Contribution Handoff，再只返回协调所需摘要；MUST不复制完整Review Result或完整Development handoff正文。

#### Scenario: Planning Review current
- **WHEN** Parent具有current Planning Review
- **THEN** v3 MUST返回present、applicability、result digest、outcome、summary与completed time
- **AND** MUST不返回完整reviewed、uncovered、findings或Result envelope

#### Scenario: Child具有matching handoff
- **WHEN** completed Child具有matching saved Contribution Handoff
- **THEN** v3 MUST返回Child binding、delivery proof与各disposition的稳定协调摘要
- **AND** MUST继续让top-level contribution正确派生delivered、residual或superseded状态

### Requirement: 正式 Child 必须代表独立交付的 Contribution
Buildr 与配套 Agent workflow MUST 只在工作单元具有独立目标、明确 scope、可单独形成 Candidate/evidence、immutable Contribution Handoff 与真实 Delivery 时建立正式 Child 并绑定 Parent Contribution。普通并行调查、临时 Agent 分工、同一交付内的局部实现或测试协作 MUST NOT 被强制建模为正式 Child、Contribution 或 Parent 进度事实。

#### Scenario: 同一 Contribution 内并行协作
- **WHEN** Agent 为同一交付目标并行安排代码检索、实现和局部测试，且这些工作不形成独立 Handoff 与 Delivery
- **THEN** workflow MUST 允许在同一正式 Task 内完成协作
- **AND** MUST NOT 仅因存在多个 Agent 或并行动作而创建 Child Task

#### Scenario: 工作单元可以独立交付
- **WHEN** 一项工作具有独立目标、scope、evidence、Handoff 与 Delivery，并需要由 Parent 追踪依赖或 residual
- **THEN** Agent MUST 建立窄 Child 并绑定唯一或明确合并的 Parent Contribution
- **AND** 该 Child MUST 按自己的 Task lifecycle 完成交付

### Requirement: 终态 Child Contribution 交付恢复必须由严格证据保护
Buildr MUST 为已 completed、非 no-change 且具有 matching terminal Finish association，但缺少原生 Contribution Handoff 的直接 Child 提供显式 terminal contribution reconciliation；该动作 MUST 绑定 current Parent Plan identity、真实 Parent/Child 关系、既有 immutable Development handoff、Candidate/generation、三个 gate、archived Change facts、完整 Contribution Handoff、reason 与 source，并 MUST NOT从 Task status、Git、文件或 canonical specs 推断交付。

#### Scenario: 恢复真实已交付 Child
- **WHEN** completed Child 的 terminal Finish association 精确匹配没有原生 Contribution Handoff 的 immutable handoff，全部 Change 已 archived，调用方基于 current Parent Plan 显式提交无 ownership 冲突的完整 Contribution Handoff
- **THEN** Application MUST append 一条绑定既有 handoff 与 Plan identity 的 immutable reconciliation evidence
- **AND** MUST保持旧 handoff、Finish terminal payload、Task Record 与 Parent Plan bytes不变

#### Scenario: 缺少正式交付关联
- **WHEN** Child 只有 completed status、Git commit、文件或 archived Change，但没有 matching terminal Finish association与 immutable handoff
- **THEN** reconciliation MUST在零写入状态返回blocked
- **AND** MUST NOT把这些辅助事实升级为 Contribution delivery

#### Scenario: 正常 Child 尝试提前使用恢复
- **WHEN** Child仍为 todo、active、abandoned，或其 matching handoff 已包含原生 Contribution Handoff
- **THEN** reconciliation MUST返回not-applicable或blocked
- **AND** normal bind、handoff与Finish路径 MUST保持唯一常规交付路径

### Requirement: Parent progress 必须消费合法恢复证据且保留来源
Parent Coordination Application MUST优先消费 matching immutable handoff 内的原生 Contribution Handoff，并且仅在原生证明缺失时消费绑定 current Plan references 的 terminal reconciliation evidence；read model MUST返回 proof kind 与适用的 reconciliation identity，仍 MUST动态派生Contribution disposition而不物化progress。

#### Scenario: 恢复证据使 unproven 变为 delivered
- **WHEN** completed Child具有合法 terminal reconciliation，且其中 delivered Contribution仍属于current Parent Plan
- **THEN** Parent read model MUST将该Child标记为delivery proven并将对应Contribution派生为delivered
- **AND** delivery summary MUST标明proof为terminal-reconciliation

#### Scenario: 恢复证据与current Plan不兼容
- **WHEN** Parent Plan reconcile后恢复证据引用的Contribution已不存在或语义不再可匹配
- **THEN** Parent read model MUST不消费该evidence形成delivered结论
- **AND** MUST返回精确diagnostic而不是扫描其他事实修补

### Requirement: 终态恢复必须幂等且拒绝交付 owner 冲突
Terminal contribution reconciliation MUST按Child与规范化evidence identity保持append-only；相同请求重放 MUST返回unchanged，不同请求覆盖既有evidence、或 planned / delivered Contribution已由其他Child绑定或证明时 MUST零写入失败。

#### Scenario: 相同恢复重放
- **WHEN** caller以相同Parent Plan、handoff association、Contribution Handoff、reason与source重复提交
- **THEN** Application MUST返回unchanged与原reconciliation identity
- **AND** MUST NOT新增第二条记录或改写createdAt

#### Scenario: Contribution owner 冲突
- **WHEN** 请求planned或delivered的Contribution已由另一个Child的原生或恢复evidence拥有
- **THEN** Application MUST返回精确owner conflict
- **AND** MUST保持全部Task Development与reconciliation事实不变
