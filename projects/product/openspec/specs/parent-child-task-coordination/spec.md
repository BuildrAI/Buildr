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
