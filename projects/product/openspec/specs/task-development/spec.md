# task-development Specification

## Purpose

定义 Development Application、Receipt、Content Target、Candidate/generation、决策、失效、Completion Review 与 Finish handoff 的唯一 authority。

## Requirements

### Requirement: Task Development 必须维护唯一 current Receipt
Buildr MUST 为每个正式 Task 提供至多一份 `.buildr/tasks/<task-id>/development.yml`，schema MUST 为 `buildr.task-development-receipt/v1`。Task Development Application MUST 是 Receipt normalization、identity、persistence、失效、Candidate generation、decision 与 handoff 的唯一 writer 和 reader；Skill、Finish、Task Record、Environment、Review 与 Verification MUST NOT 直接读写该 store。

#### Scenario: 首次观察 Development context
- **WHEN** active Task 具有 matching ready Task Environment，且调用方请求建立 Development current facts
- **THEN** Application MUST 原子创建唯一 Development Receipt并返回 read model
- **AND** filesystem MUST NOT 创建 Candidate、decision、handoff或历史占位文件

#### Scenario: 其他模块需要 Development facts
- **WHEN** Finish 或 Skill 需要当前 Candidate/handoff
- **THEN** consumer MUST 调用 Task Development Application inspect或专用 action
- **AND** persistence reader 的静态调用方 MUST 只有 Task Development Application

### Requirement: Development Receipt 必须使用关闭且最小的数据模型
Receipt MUST 只包含 `schemaVersion`、`taskId`、Environment Receipt逻辑引用`environment`、`taskContext`、`contentTarget`、`verificationPolicy`、`generation`、`candidate`、`gates`、`decision`、不可变快照数组`handoffs`、`createdAt` 与 `updatedAt`。Receipt MUST NOT 保存 source diff、文件 inventory、命令输出、时长、绝对 execution path、Environment资源/handle、完整 Review/Verification Result、聊天、隐藏推理、完整Candidate history、revision、CAS、锁或租约。

#### Scenario: 调用方提交未知 authority 字段
- **WHEN** action input 或持久 Receipt 包含 progress、step、attempt、raw evidence、Result body、Git branch/commit、OpenSpec plan、history或其他未知字段
- **THEN** Application MUST 拒绝整个值并保留原 current bytes
- **AND** MUST 返回精确 forbidden field diagnostic

#### Scenario: 原子替换中断
- **WHEN** serialization、临时写入、rename或post-read任一阶段失败
- **THEN** Repository MUST 保留或恢复原 current Receipt与所有 sibling records
- **AND** MUST 只清理本次写入可证明拥有的临时文件

### Requirement: Task context identity 必须绑定完整 Intent、scope 与 Change context
Application MUST 从 Task Record Application/persistence authority 取得 Task ID、intent、完整 Project/Service scope与0..N Change references，并结合 Development记录的每个 Change disposition派生可移植 `taskContext.identity`。Identity MUST NOT 绑定Task Record时间戳、本机路径或默认 Product/Service名称。

#### Scenario: 多 Change Task context
- **WHEN** Task Record包含多个不同Project/Change references
- **THEN** context identity输入 MUST 对全部reference和disposition确定性排序并完整绑定
- **AND** 任一 reference新增、删除或disposition变化 MUST 使旧 Candidate/handoff失效

#### Scenario: 无 OpenSpec 的 code-only Task
- **WHEN** Task Record的Change references为空
- **THEN** Application MUST 接受明确的code-only context并派生稳定identity
- **AND** MUST NOT 创建、推断、选择或调用虚假Change/OpenSpec能力

### Requirement: Content Target 必须完整且不预设源码工具
Application MUST 从matching ready Task Environment read model取得全部Task scopes，并通过selected Content Target observer port观察每个scope的当前内容。Target MUST 包含按selector排序的component identities与aggregate identity；identity MUST 绑定逻辑source path与current bytes语义，MUST NOT绑定branch、commit、worktree、绝对路径、时间、Project code常量、Git、Node/npm或OpenSpec假设。

#### Scenario: Git-backed Buildr自举scope
- **WHEN** registered source provider能提供可移植content inventory
- **THEN** infrastructure observer MAY消费该provider evidence
- **AND** Development Application MUST 只处理统一component read model，不得分支解释Git ref或Buildr固定目录

#### Scenario: 非Git普通Workspace
- **WHEN** ready Environment scopes位于没有Git和OpenSpec的普通filesystem Workspace
- **THEN** fallback observer MUST 对允许scope建立确定性的portable content identity
- **AND** 相同bytes位于不同绝对根 MUST 得到相同identity

#### Scenario: scope内容在Verification后变化
- **WHEN** 任一受管source file新增、删除、内容或可执行语义变化
- **THEN** 重新观察的Content Target MUST 与旧target不同
- **AND** Application MUST 清除current Candidate、Completion gate与decision，并使既有handoff snapshot不再current但不得改写或删除

### Requirement: Verification policy decision 必须由 Development 独占
Task Development MUST 记录一个closed verification policy decision，绑定Task scope内当前declaration observations、明确选择的capability identities、是否required及coverage gaps，并派生`verificationPolicy.identity`。Application MUST 通过Task Verification Application取得declaration read model，MUST NOT直接读取verification.yml或Verification Result store，也不得硬编码Product capability。

#### Scenario: Project声明required capability
- **WHEN** Development选择当前declaration中一个适用capability作为required
- **THEN** Application MUST 校验Project/Service scope与declaration identity并纳入policy identity
- **AND** declaration或选择变化 MUST 使旧Verification gate、Candidate与handoff失效

#### Scenario: 没有可用能力
- **WHEN** 某个scope没有declaration或适用capability
- **THEN** policy decision MUST 显式记录portable coverage gap
- **AND** Development MUST NOT创建测试、脚本、declaration或第二verification registry

### Requirement: Formal Verification 必须在 Candidate freeze 之前绑定 Content Target
Development MUST 先建立stable Content Target与verification policy，再由现有Task Verification workflow针对该Content Target形成current Result。冻结Candidate前，Application MUST 通过Task Verification Application inspect证明target/declarations current且policy要求的capability fact或coverage gap完整；Application本身MUST NOT执行formal Verification或写Verification Result，也MUST NOT把`not-passed`改写为`passed`。

#### Scenario: current Result满足policy事实完整性
- **WHEN** Verification Application返回Result target等于current Content Target、declarations current，且required capability facts或明确coverage gap完整
- **THEN** Development MAY 将Verification gate记为current并继续Candidate freeze
- **AND** Candidate value MUST NOT包含Result identity或digest

#### Scenario: Verification仍绑定旧Content Target
- **WHEN** Result target与current Content Target不同或declaration applicability为stale/unknown
- **THEN** Candidate freeze MUST blocked并返回Task Verification next action
- **AND** Development MUST NOT改写Result、applicability或伪造passed evidence

#### Scenario: Verification结论not-passed
- **WHEN** current Result完整但结论为`not-passed`
- **THEN** Development MAY冻结Candidate，但在没有绑定精确Verification Result digest、范围和授权来源的风险接受时 MUST记录blocked且不得形成handoff
- **AND** scoped risk MUST NOT把Verification事实改写为passed或使stale/incomplete Result适用

### Requirement: Planning Review 必须在Candidate前保持current
若Task workflow要求Planning Review，Development MUST 只通过Task Review Application inspect消费target为current planning identity且outcome为`ready`的Result。Development MUST NOT读取Review store、复制findings或替代语义Review。

#### Scenario: Planning Result current且ready
- **WHEN** Task Review Application报告planning target current且conclusion ready
- **THEN** Development MAY 保存其最小gate reference并继续freeze
- **AND** reference MUST 只含Result digest、target、outcome与applicability

#### Scenario: Planning方案发生变化
- **WHEN** current planning target与已有Planning Result target不同
- **THEN** Application MUST 把Planning gate视为stale并阻止freeze
- **AND** MUST 保留Review owner中的旧Result不变

### Requirement: Candidate identity 与generation必须只由Development生成
Application MUST 只在Task context、Content Target、verification policy与Planning gate current，并且Verification target/declarations current且policy facts完整时冻结Candidate。Candidate closed value MUST 只包含`identity`、正整数`generation`、`contentTargetIdentity`、`taskContextIdentity`与`policyIdentity`；identity MUST 绑定这四项，generation MUST 只由Development单调生成。

#### Scenario: 首次冻结Candidate
- **WHEN** 全部前置适用性与事实完整性条件满足且当前没有Candidate
- **THEN** Application MUST 生成generation 1与唯一Candidate identity
- **AND** Review/Verification Result digest、Environment identity、时间、branch或commit MUST NOT进入Candidate

#### Scenario: 已有current Candidate重复freeze
- **WHEN** inputs与gates均未变化且current Candidate仍适用
- **THEN** freeze MUST 幂等返回同一Candidate/generation
- **AND** MUST NOT仅因重复调用递增generation

#### Scenario: 失效后形成下一代Candidate
- **WHEN** 旧Candidate已因上游变化失效，新的Content Target与gates重新满足
- **THEN** Application MUST 生成严格大于旧generation的新Candidate
- **AND** Receipt MUST 只保留新current Candidate，不创建完整generation history；既有正式handoff snapshots保持不可变

### Requirement: Completion Review 必须绑定Candidate且由Development消费
Candidate冻结后，Completion Review MUST 由Task Review Application以`reviewType: completion`记录并绑定current Candidate identity。Development MUST 通过Application read model证明target current且outcome ready；Candidate变化时旧Completion Result MUST stale。

#### Scenario: Completion Review通过
- **WHEN** Completion Result target等于current Candidate且conclusion ready
- **THEN** Development MUST 保存最小Completion gate reference
- **AND** MUST NOT把review findings、method细节或Result body复制进Candidate

#### Scenario: Candidate变化
- **WHEN** 新generation替换旧Candidate
- **THEN** 旧Completion Result MUST 由Task Review Application派生为stale
- **AND** Development MUST 清除旧Completion gate与decision，并使旧handoff snapshot不再current但不得改写或删除

### Requirement: Development 必须独占proceed/blocked、scoped risk与Finish handoff
只有Task Development MAY 根据current gates形成`proceed|blocked` decision并记录与Task Intent或明确用户授权相关的最小portable scoped risk。只有current Candidate、Planning/Verification/Completion gates与`proceed` decision全部满足时，Application MAY形成immutable handoff snapshot与identity；Verification与Review Result MUST保持原专业事实。

#### Scenario: 全部正向gate满足且决定proceed
- **WHEN** current Candidate、三个gate及policy coverage均current且结论正向
- **THEN** Application MUST 形成绑定Candidate、gate refs与decision的Finish handoff
- **AND** handoff MUST 不包含Result body、raw output、临时路径或delivery execution plan

#### Scenario: 用户接受负向Verification或Completion风险
- **WHEN** current Verification为`not-passed`、存在coverage gap或current Completion为`changes-required`，且用户明确接受与Task Intent相关的风险
- **THEN** Development MAY记录gate、精确Result digest、scope、summary与authorization source并据此决定proceed
- **AND** MUST NOT用风险接受改写专业事实或绕过stale/incomplete gate、Content Target漂移

#### Scenario: handoff后上游漂移
- **WHEN** Content Target、Task context、policy、Candidate或任一gate applicability变化
- **THEN** Application MUST 清除current decision、判定旧snapshot不再current并返回`task-development`
- **AND** Finish MUST 不得继续消费旧snapshot，Application MUST NOT改写或删除它

### Requirement: Finish carrier 必须由Development证明内容等价
Task Finish MAY 请求Development Application针对一个允许的carrier root重观测complete Content Target，但MUST NOT创建Candidate。只有carrier Content Target与handoff Candidate绑定的target逐component相等且Task context/policy仍current时，Application MUST 返回equivalent；否则MUST返回Development handoff失效。

#### Scenario: 只增加delivery commit
- **WHEN** Finish机械提交当前内容但所有scope bytes与逻辑语义未变化
- **THEN** carrier equivalence MUST通过且Candidate identity保持不变
- **AND** commit、branch与ref MUST不进入Content Target或Candidate identity

#### Scenario: carrier prepare改变内容
- **WHEN** rebase、sync、archive、生成或冲突处理改变任一component identity
- **THEN** equivalence MUST失败并判定current handoff失效
- **AND** Finish MUST退出到Development重新验证和生成Candidate

### Requirement: Local App 必须只读投影任务研发 read model
Buildr Local App MUST 为正式 Task 提供只读“研发”视图，并 MUST 通过 Task Development Application `inspect` 展示 Development presence、当前适用性、Task context、Content Target、verification policy、Candidate/generation、Planning/Verification/Completion gates、decision、明确风险与最近一次 Development handoff。HTTP 与 Web 层 MUST NOT 直接读取或解析 `development.yml`、重新计算 identity/currentness、复制专业 Result body、提供 Receipt mutation 或注册公共 `buildr task development` CLI。

#### Scenario: 查看 current Development
- **WHEN** Task Development Application 返回 `developing`、`candidate-current` 或 `handoff-current`
- **THEN** 页面 MUST 用中文分别显示“研发中”“候选已就绪”或“研发交接已就绪”
- **AND** MUST 将 Task context、Content Target、policy、Candidate 与 handoff 的 current/stale/missing 作为独立事实展示，不得改写 Task Record status

#### Scenario: Development 尚未形成
- **WHEN** Application `inspect` 返回 `status: missing` 且没有 Development Receipt
- **THEN** 页面 MUST 显示“尚未形成研发回执”的空状态
- **AND** 概览、证据和环境视图 MUST 继续正常工作，不得创建空 Receipt 或提供浏览器写操作

#### Scenario: 当前环境不可观察但历史交接存在
- **WHEN** Application 返回已有 Receipt 且 `applicability.status` 为 `unknown`
- **THEN** 页面 MUST 保留展示已保存的候选、决定和最近一次研发交接摘要，并明确显示“历史研发交接仍被保留，但当前无法实时复核”
- **AND** 页面 MUST NOT 将历史交接标记为 current、stale 或 failed，也不得从 Environment cleanup 推断 Task 顶层状态

#### Scenario: 安全读取 Development
- **WHEN** 客户端对已登记 Workspace 和真实 Task 发起 `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/development`
- **THEN** API MUST 返回 Task Development Application operation read model 并使用 no-store 语义
- **AND** query 参数、未知 Task、POST、PUT、PATCH 与 DELETE MUST fail closed，且 Task、Receipt、Review、Verification 与 Environment bytes MUST 保持不变

#### Scenario: 展示最小研发信息
- **WHEN** Development Receipt 包含长 identity、多个 handoff 或专业 Result reference
- **THEN** 页面 MUST 默认只展示完整但次级排版的当前 identity、候选代次、三个 gate 摘要、决定、风险数量和最近一次 handoff
- **AND** MUST NOT展示开发日志、source diff、完整命令输出、隐藏推理、完整 Result body或全部历史 handoff 列表

### Requirement: Task Development writer 必须声明portable Receipt path并保持Candidate分离
Task Development writer MUST声明 `buildr.task-development/v1`唯一拥有 `.buildr/tasks/<task-id>/development.yml`，该current Receipt为可选、portable publication eligible；Task Candidate、delivery source、task worktree、runtime与session MUST NOT因该声明成为publication内容。

#### Scenario: Development Receipt存在
- **WHEN** writer可安全读取当前 `development.yml`
- **THEN** publication scope MUST只纳入该exact path
- **AND** metadata commit MUST与Candidate/delivery commit分离

#### Scenario: publication失败
- **WHEN** snapshot、commit或push失败
- **THEN** Development writer MUST保持generation、Candidate、gates、decision与handoffs不变
