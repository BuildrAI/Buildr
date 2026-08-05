# task-development Specification

## Purpose

定义 Development Application、Receipt、Content Target、Candidate/generation、决策、失效、Completion Review 与 Finish handoff 的唯一 authority。

## Requirements

### Requirement: Task Development 必须维护唯一 current Receipt
Buildr MUST 为每个正式 Task 在 Workspace SQLite 中提供至多一份 `buildr.task-development-receipt/v2` current Receipt。Task Development Application MUST 是 Receipt normalization、identity、persistence、失效、planning snapshot、Candidate generation、decision 与 handoff 的唯一 writer 和 reader；Skill、Finish、Task Record、Environment、Review 与 Verification MUST NOT 直接读写 repository 或 SQLite。

#### Scenario: 首次观察 Development context
- **WHEN** active Task 具有 matching ready Task Environment，且调用方请求建立 Development current facts
- **THEN** Application MUST 在 transaction 中创建唯一 Development current Receipt并返回 read model，不要求 Planning Review ready或Content Target已经形成
- **AND** store MUST NOT 创建 Candidate、decision、handoff或历史占位记录

#### Scenario: 其他模块需要 Development facts
- **WHEN** Finish、Local App 或 Skill 需要当前研发事实、Candidate或handoff
- **THEN** consumer MUST 调用 Task Development Application inspect或专用 action
- **AND** persistence reader 的静态调用方 MUST 只有 Task Development Application

#### Scenario: 读取既有v1 Receipt
- **WHEN**旧File Store中存在合法`buildr.task-development-receipt/v1`
- **THEN** Application MUST将该文件保持inert且返回SQLite current Receipt或missing
- **AND** inspect与下一次合法Development mutation MUST NOT读取、投射或迁移v1文件

#### Scenario: 旧 Development YAML 存在
- **WHEN** `.buildr/tasks/<task-id>/development.yml` 仍存在或使用旧 schema
- **THEN** Application MUST 将其保持 inert且只读取 SQLite current Receipt
- **AND** MUST NOT 导入、升级、删除或生成兼容 YAML

### Requirement: Development Receipt 必须使用关闭且最小的数据模型
Receipt MUST 只包含 `schemaVersion`、`taskId`、Environment Receipt逻辑引用`environment`、`taskContext`、`planning`、可为空的`contentTarget`、`verificationPolicy`、`generation`、`candidate`、`gates`、`decision`、不可变快照数组`handoffs`、`createdAt` 与 `updatedAt`。Receipt MUST NOT 保存 source diff、文件 inventory、命令输出、时长、绝对 execution path、Environment资源/handle、完整 Review/Verification Result、聊天、隐藏推理、完整Candidate history、revision、CAS、锁或租约。

#### Scenario: 调用方提交未知 authority 字段
- **WHEN** action input 或持久 Receipt 包含 progress、step、attempt、raw evidence、Result body、Git branch/commit、OpenSpec plan、history或其他未知字段
- **THEN** Application MUST 拒绝整个值并保留原 current value
- **AND** MUST 返回精确 forbidden field diagnostic

#### Scenario: Content Target尚未形成
- **WHEN** Receipt只记录proposal、design、review disposition或其他planning facts
- **THEN** `contentTarget` MUST为null且inspect MUST返回`missing` applicability
- **AND** Candidate、verification policy、Verification/Completion gate、decision与handoff MUST保持null或空数组

#### Scenario: 原子替换中断
- **WHEN** serialization、SQLite mutation或post-read任一阶段失败
- **THEN** Repository MUST rollback并保留原 current Receipt与所有 sibling records
- **AND** MUST NOT 产生部分 row、backup file或兼容 YAML

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
Development MUST 只通过Task Review Application inspect消费Planning Result；若当前policy要求Planning Review，则target为current planning identity且outcome为`ready`的Result MUST在Candidate前成立。Policy判定Planning Review不适用时MUST记录`not-applicable`；用户明确跳过时MUST记录`waived`与授权来源。Development MUST NOT读取Review store、复制findings、替代语义Review或把waiver伪造成Result。

#### Scenario: Planning Result current且ready
- **WHEN** Task Review Application报告planning target current且conclusion ready
- **THEN** Development MUST 保存`current`最小gate reference并允许继续freeze
- **AND** reference MUST 只含Result digest、target、outcome、disposition与applicability

#### Scenario: Planning方案发生变化
- **WHEN** current planning target与已有Planning Result target不同
- **THEN** Application MUST 把Planning gate派生为stale并阻止freeze，直到重新Review或得到合法disposition
- **AND** MUST 保留Review owner中的旧Result不变

#### Scenario: Planning Review被明确跳过
- **WHEN** 用户明确授权当前planning target跳过Planning Review
- **THEN** Development MAY保存`waived` gate并继续Candidate policy判断
- **AND** gate MUST绑定target identity、summary与authorization source且不得包含伪造Result digest

### Requirement: Candidate identity 与generation必须只由Development生成
Application MUST 只在Task context、stable Content Target、verification policy与全部适用研发节点/gates得到明确处置，并且Verification事实满足policy时冻结Candidate。Candidate closed value MUST 只包含`identity`、正整数`generation`、`contentTargetIdentity`、`taskContextIdentity`与`policyIdentity`；identity MUST绑定这四项，generation MUST只由Development单调生成。Planning snapshot或gate disposition变化MUST使current Candidate失效，但MUST NOT把Planning、Verification或Completion Result identity嵌入Candidate。

#### Scenario: 首次冻结Candidate
- **WHEN** 全部适用前置事实完整且当前没有Candidate
- **THEN** Application MUST生成generation 1与唯一Candidate identity
- **AND** Review/Verification Result digest、Environment identity、时间、branch或commit MUST NOT进入Candidate

#### Scenario: 已有current Candidate重复freeze
- **WHEN** inputs、planning snapshot与gates均未变化且current Candidate仍适用
- **THEN** freeze MUST幂等返回同一Candidate/generation
- **AND** MUST NOT仅因重复调用递增generation

#### Scenario: 失效后形成下一代Candidate
- **WHEN** 旧Candidate已因planning snapshot、gate disposition或其他上游输入变化失效，新的事实重新满足policy
- **THEN** Application MUST生成严格大于旧generation的新Candidate
- **AND** Receipt MUST只保留新current Candidate，不创建完整generation history；既有正式handoff snapshots保持不可变

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
只有Task Development MAY 根据current Candidate、专业Result gates与明确`not-applicable|waived` dispositions形成`proceed|blocked` decision，并记录与Task Intent或明确用户授权相关的最小portable scoped risk。只有current Candidate、全部适用gate与disposition、`proceed` decision同时成立时，Application MAY形成immutable handoff snapshot与identity；Verification与Review Result MUST保持原专业事实。

#### Scenario: 全部正向gate满足且决定proceed
- **WHEN** current Candidate、适用专业gate、合法not-applicable/waived dispositions及policy coverage均current
- **THEN** Application MUST形成绑定Candidate、gate/disposition refs与decision的Finish handoff
- **AND** handoff MUST不包含Result body、raw output、临时路径或delivery execution plan

#### Scenario: 用户接受负向Verification或Completion风险
- **WHEN** current Verification为`not-passed`、存在coverage gap或current Completion为`changes-required`，且用户明确接受与Task Intent相关的风险
- **THEN** Development MAY记录gate、精确Result digest、scope、summary与authorization source并据此决定proceed
- **AND** MUST NOT用风险接受改写专业事实或绕过stale/incomplete gate、Content Target漂移

#### Scenario: handoff后上游漂移
- **WHEN** planning snapshot、Content Target、Task context、policy、Candidate或任一gate applicability/disposition变化
- **THEN** Application MUST清除current decision、判定旧snapshot不再current并返回`task-development`
- **AND** Finish MUST不得继续消费旧snapshot，Application MUST NOT改写或删除它

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
Buildr Local App MUST 为正式 Task 提供只读“研发”视图，并 MUST 通过 Task Development Application `inspect` 展示 Development presence、当前适用性、planning nodes/dispositions、Task context、Content Target、verification policy、Candidate/generation、Planning/Verification/Completion gates、decision、明确风险与最近一次 Development handoff。HTTP 与 Web 层 MUST NOT 直接读取或解析 `development.yml`、重新计算 identity/currentness、复制专业 artifact/Result body、提供 Receipt mutation 或注册公共`buildr task development` CLI。

#### Scenario: 查看 current Development
- **WHEN** Task Development Application返回`planning`、`developing`、`candidate-current`或`handoff-current`
- **THEN** 页面 MUST用中文分别显示“规划中”“研发中”“候选已就绪”或“研发交接已就绪”
- **AND** MUST将planning、Task context、Content Target、policy、Candidate与handoff的current/stale/missing/disposition作为独立事实展示，不得改写Task Record status

#### Scenario: Development 尚未形成
- **WHEN** Application `inspect`返回`status: missing`且没有Development Receipt
- **THEN** 页面 MUST显示“尚未形成研发回执”的空状态
- **AND** 概览、证据和环境视图 MUST继续正常工作，不得创建空Receipt或提供浏览器写操作

#### Scenario: 只有planning facts
- **WHEN** Receipt已经记录proposal、design、review disposition或其他planning nodes，但Content Target仍为null
- **THEN** 页面 MUST展示节点authority、reference、disposition与适用的waiver来源，并显示“规划中”
- **AND** MUST NOT把尚未形成的Content Target、policy或Candidate显示为stale或failed

#### Scenario: 当前环境不可观察但历史交接存在
- **WHEN** Application返回已有Receipt且`applicability.status`为`unknown`
- **THEN** 页面 MUST保留展示已保存的planning、候选、决定和最近一次研发交接摘要，并明确显示“历史研发交接仍被保留，但当前无法实时复核”
- **AND** 页面 MUST NOT将历史交接标记为current、stale或failed，也不得从Environment cleanup推断Task顶层状态

#### Scenario: 安全读取 Development
- **WHEN** 客户端对已登记Workspace和真实Task发起`GET /api/v1/workspaces/:workspaceId/tasks/:taskId/development`
- **THEN** API MUST返回Task Development Application operation read model并使用no-store语义
- **AND** query参数、未知Task、POST、PUT、PATCH与DELETE MUST fail closed，且Task、Receipt、Review、Verification与Environment bytes MUST保持不变

#### Scenario: 展示最小研发信息
- **WHEN** Development Receipt包含长identity、多个planning nodes/handoff或专业Result reference
- **THEN** 页面 MUST默认只展示完整但次级排版的当前identity、节点disposition、候选代次、三个gate摘要、决定、风险数量和最近一次handoff
- **AND** MUST NOT展示开发日志、source diff、完整命令输出、隐藏推理、专业artifact/Result body或全部历史handoff列表

### Requirement: Task Development 必须覆盖完整正式研发区间
Task Development MUST 从 active Task 的首个正式研发动作开始维护研发聚合事实，直到形成 current Finish handoff。Proposal、design、Planning Review、实现收敛、formal Verification 与 Completion Review 等节点 MUST 可按 Task 事实不存在、`not-applicable` 或由明确授权 `waived`；节点存在时 Development MUST 保存其专业 authority、portable reference、identity 与 disposition，不得复制专业内容或 Result 正文。

#### Scenario: 从 proposal 开始正式研发
- **WHEN** active Task 在 ready Environment 中开始创建 proposal，且尚未形成 Content Target
- **THEN** Development Application MUST 原子建立 Receipt 与 current planning snapshot
- **AND** Receipt MUST 不创建 Content Target、verification policy、Candidate、Result gate、decision 或 handoff 占位事实

#### Scenario: code-only Task 直接实现
- **WHEN** Task 没有 proposal、design 或 Change，且首个正式研发动作为代码实现
- **THEN** Development MUST 接受空 planning nodes 与空 Change references并开始维护研发事实
- **AND** MUST NOT为了流程完整虚构 OpenSpec、Planning Review 或其他节点

#### Scenario: 用户主动跳过节点
- **WHEN** 用户或具备业务授权的来源明确跳过一个适用研发节点
- **THEN** Development MUST 记录 `waived`、精确目标、summary 与 authorization source
- **AND** MUST NOT把 waiver 写成专业 Result 的 `ready`、`passed` 或 `current`

### Requirement: Planning snapshot 必须最小、可移植且不是事件历史
Development Receipt MUST 保存一个 closed current `planning` snapshot，包含确定性 identity 与按稳定 id 排序的 nodes。Node MUST 只包含 `id`、`kind`、`authority`、portable `reference`、内容 `identity`、`pending|current|stale|not-applicable|waived` disposition、最小 `summary` 与按需 `source`；MUST NOT保存正文、diff、命令、attempt、progress、transition event或完整历史。

#### Scenario: 专业 artifact 已形成
- **WHEN** proposal、design 或 Project 自定义规划 artifact 已由其专业 authority 保存
- **THEN** Development planning node MUST 只引用该 authority 的portable reference与content identity
- **AND** artifact内容变化后旧node MUST 不得继续解释为current

#### Scenario: 节点不适用
- **WHEN** Task性质决定某节点不适用
- **THEN** Development MAY 保存`not-applicable`与最小依据，或在没有治理价值时不创建该node
- **AND** MUST NOT创建空artifact、空Result或虚假identity
