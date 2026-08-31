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
- **WHEN** Finish、Buildr Web 或 Skill 需要当前研发事实、Candidate或handoff
- **THEN** consumer MUST 调用 Task Development Application inspect或专用 action
- **AND** persistence reader 的静态调用方 MUST 只有 Task Development Application

#### Scenario: 读取既有v1 Receipt
- **WHEN** 旧File Store中存在合法`buildr.task-development-receipt/v1`
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
Application MUST 从 Task Record Application/persistence authority 取得 Task ID、intent、完整 Project/Service scope与0..N Change references，并结合 Development记录的每个 Change disposition派生可移植 `taskContext.identity`。Identity MUST NOT 绑定Task Record时间戳、本机路径或默认 Product/Service名称。调用方提交`converged` disposition时，Application MUST复用Task Record的Task-scoped Change read model，证明当前working copy存在且lifecycle为`archived`；不得信任调用方summary、路径、retained baseline或文件存在推断convergence。

#### Scenario: 多 Change Task context
- **WHEN** Task Record包含多个不同Project/Change references
- **THEN** context identity输入 MUST 对全部reference和disposition确定性排序并完整绑定
- **AND** 任一 reference新增、删除或disposition变化 MUST 使旧 Candidate/handoff失效

#### Scenario: 无 OpenSpec 的 code-only Task
- **WHEN** Task Record的Change references为空
- **THEN** Application MUST 接受明确的code-only context并派生稳定identity
- **AND** MUST NOT 创建、推断、选择或调用虚假Change/OpenSpec能力

#### Scenario: Task Environment 已归档 Change
- **WHEN** 调用方为关联Change提交`converged`，Task-scoped Change read model显示当前working copy已`archived`，但retained baseline仍为active
- **THEN** Application MUST接受该disposition并以working copy lifecycle形成current Task context
- **AND** MUST NOT要求retained checkout在Finish前同步或归档同一Change

#### Scenario: Change仍active却声明converged
- **WHEN** 调用方为关联Change提交`converged`，但当前working copy仍active、缺失、不可用或无法确定lifecycle
- **THEN** Application MUST返回稳定blocked诊断并保持原Development current值不变
- **AND** MUST要求先由OpenSpec专业流程完成deterministic convergence/archive，不得创建Content Target、Candidate或handoff

#### Scenario: 已形成Candidate后Change lifecycle漂移
- **WHEN** Receipt保存`converged`，但后续Task-scoped Change read model不再证明同一working copy为archived
- **THEN** Development currentness MUST派生Task context、Candidate与handoff为stale或blocked
- **AND** MUST NOT改写历史handoff、自动执行convergence或让Task Finish解释Change lifecycle

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
Application MUST只在Task context、stable Content Target、verification policy与Candidate前适用的planning dispositions得到明确处置时冻结Candidate。Candidate closed value MUST只包含`identity`、正整数`generation`、`contentTargetIdentity`、`taskContextIdentity`与`policyIdentity`；identity MUST绑定这四项，generation MUST只由Development单调生成。Content Target、Task Context、policy或Candidate前planning disposition变化MUST使current Candidate失效；后续Verification、Completion Review或Current Knowledge disposition变化MUST使相关gate、decision与handoff失效，但MUST NOT改变Candidate identity或generation。

#### Scenario: 首次冻结Candidate
- **WHEN** Candidate前适用事实完整且当前没有Candidate
- **THEN** Application MUST生成generation 1与唯一Candidate identity
- **AND** Review/Verification Result digest、knowledge disposition、Environment identity、时间、branch或commit MUST NOT进入Candidate

#### Scenario: 已有current Candidate重复freeze
- **WHEN** Task Context、Content Target、policy与Candidate前planning disposition均未变化且current Candidate仍适用
- **THEN** freeze MUST幂等返回同一Candidate/generation
- **AND** MUST NOT仅因Verification、Completion或knowledge尚未形成而递增generation

#### Scenario: 失效后形成下一代Candidate
- **WHEN** 旧Candidate已因Content Target、Task Context、policy或Candidate前planning disposition变化失效，新的事实重新满足freeze条件
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
只有Task Development MAY根据current Candidate、专业Result gates、current knowledge disposition与明确`not-applicable|waived` dispositions形成`proceed|blocked` decision，并记录与Task Intent或明确用户授权相关的最小portable scoped risk。只有current Candidate、全部适用gate与disposition、非blocked的current knowledge disposition及`proceed` decision同时成立时，Application MAY形成immutable handoff snapshot与identity；Verification、Review与Current Knowledge专业事实 MUST保持各自authority。

#### Scenario: 全部正向gate满足且决定proceed
- **WHEN** current Candidate、适用专业gate、合法not-applicable/waived dispositions、policy coverage与current knowledge disposition均current
- **THEN** Application MUST形成绑定Candidate、gate/disposition refs、knowledge disposition与decision的Finish handoff
- **AND** handoff MUST不包含Result body、knowledge正文、raw output、临时路径或delivery execution plan

#### Scenario: 用户接受负向Verification或Completion风险
- **WHEN** current Verification为`not-passed`、存在coverage gap或current Completion为`changes-required`，且用户明确接受与Task Intent相关的风险
- **THEN** Development MAY记录gate、精确Result digest、scope、summary与authorization source并据此决定proceed
- **AND** MUST NOT用风险接受改写专业事实、接受completion-critical knowledge conflict或绕过stale/incomplete gate、Content Target漂移

#### Scenario: handoff后上游漂移
- **WHEN** planning snapshot、Content Target、Task context、policy、Candidate、current knowledge或任一gate applicability/disposition变化
- **THEN** Application MUST清除current decision、判定旧snapshot不再current并返回`task-development`
- **AND** Finish MUST不得继续消费旧snapshot，Application MUST NOT改写或删除它

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

`begin|planning` action MUST把`planning`作为显式必填的完整整值snapshot；即使没有实际node，consumer也 MUST提交`{ "targetIdentity": null, "nodes": [] }`。省略`planning` MUST在任何Receipt写入前失败关闭，MUST NOT被解释为空replacement、preserve、patch或由Buildr推断。

#### Scenario: 专业 artifact 已形成
- **WHEN** proposal、design 或 Project 自定义规划 artifact 已由其专业 authority 保存
- **THEN** Development planning node MUST 只引用该 authority 的portable reference与content identity
- **AND** artifact内容变化后旧node MUST 不得继续解释为current

#### Scenario: 节点不适用
- **WHEN** Task性质决定某节点不适用
- **THEN** Development MAY 保存`not-applicable`与最小依据，或在没有治理价值时不创建该node
- **AND** MUST NOT创建空artifact、空Result或虚假identity

#### Scenario: begin或planning省略完整snapshot
- **WHEN** consumer调用`begin|planning`但没有提交顶层`planning`
- **THEN** shared action contract与Application MUST返回required-field diagnostic并保持零写入
- **AND** 既有planning、Candidate、gates、decision与handoffs MUST保持不变

### Requirement: Task Development operation 必须提供有界的执行成本诊断

Task Development 内部 driver MUST 在显式 profiling 请求下返回 response-only 阶段计时，至少区分 module load、runtime composition、Application execution、result serialization 与 total；默认 operation result shape MUST保持不变。计时 MUST NOT进入 Development Receipt、Workspace SQLite、Candidate、Result、decision或handoff，也 MUST NOT把 Agent harness、shell或外层工具调度时间算作产品 execution。

#### Scenario: 显式请求 profiling

- **WHEN** Agent 对一个 Task Development driver action 显式传入 profiling 选项
- **THEN** driver MUST返回原 Application result与各产品进程内阶段的非负计时
- **AND** timing MUST只作为 response evidence，不产生额外持久化 effect

#### Scenario: 普通 transition 保持兼容

- **WHEN** Agent 未请求 profiling并执行任一现有 Task Development action
- **THEN** driver MUST继续返回现有 `buildr.task-development-operation-result/v1`
- **AND** Receipt、Candidate、gate、decision与handoff语义 MUST保持不变

### Requirement: Task Development operation 必须限制重复 Workspace 观察

Task Development Application MUST把每个公开 action 作为独立 operation scope；同一同步 action 内对相同 canonical Workspace 的重复 Structured Store访问 MUST复用已成功验证的 canonical root与不可变package migration assets，并 MAY复用由Task Record与Task Environment owner Application对相同输入形成的完整read model。scope MUST在返回或失败时结束，后续 action MUST重新观察 current Workspace；系统 MUST NOT跨process或跨action缓存Task、Environment、Review、Verification、Development read model或SQLite connection。

#### Scenario: 同一 action 重复访问 Structured Store

- **WHEN** 一个 Task Development action 通过多个专业 Application或repository重复访问相同 canonical Workspace
- **THEN** 系统 MUST在该action内最多执行一次Git checkout canonical observation
- **AND**相同Task Record或Environment输入的复用值 MUST来自对应owner Application，不得由Task Development直接读取专业repository
- **AND**每个repository MUST继续保留自身读取、transaction、validation与close语义

#### Scenario: action 结束后重新确认

- **WHEN** 前一个Task Development action已成功、失败或抛出异常，随后启动新的action
- **THEN** 新action MUST重新确认canonical Workspace与current专业facts
- **AND**前一个scope的缓存 MUST不可见

#### Scenario: 长寿命 runtime 中 Workspace 发生变化

- **WHEN** Buildr Web或其他长寿命consumer复用同一runtime并在两个Task Development action之间发生Git或Workspace变化
- **THEN** 第二个action MUST不复用第一个action的canonical判定或专业read model
- **AND**系统 MUST保持现有fail-closed诊断

### Requirement: terminal Task 必须提供交付时研发快照且不得伪造 live currentness
Task Development 的只读 consumer MUST 能以 Development Receipt 中已冻结的 Task Context、planning、Content Target、verification policy、Candidate/generation 与 immutable handoff，以及matching Finish completion association构造terminal delivery snapshot。该snapshot MUST与Development row最近一次正式action保存的applicability分离，MUST NOT因历史事实已交付而把任一实时轴标记为current，也MUST NOT为读取terminal Task恢复或重建Environment。

#### Scenario: completed Task 的 Environment 已清理
- **WHEN** Task已completed、matching Finish completion已证明交付且Environment cleanup已完成
- **THEN** read model MUST返回交付时研发快照与delivered主结论
- **AND** 六个实时currentness轴 MUST NOT被伪装为current
- **AND** Terminal Delivery inspect MUST只读取SQLite保存的Development与Finish facts

#### Scenario: active Task 的 Environment 不可用
- **WHEN** active Task最近一次Development action保存的applicability表示Environment相关axis blocked、cleaned、unavailable或unknown
- **THEN** 原有保存applicability MUST继续返回对应状态或unknown
- **AND** terminal delivery projection MUST NOT误报delivered，也不得在读取时重新判断Environment

#### Scenario: abandoned Task
- **WHEN** Task status为abandoned且存在历史Development Receipt
- **THEN** read model MUST只返回历史快照、保存applicability与abandoned结论
- **AND** MUST NOT重新判断、恢复或生成Candidate

### Requirement: Development applicability 必须由正式 action 原子保存
Task Development Application MUST 在每个成功的begin、planning、observe、policy、gate、freeze、decide与handoff action中，基于该action已取得的Task、Environment、Content Target、declaration与专业Result facts形成一次完整applicability observation，并与新的Development Receipt在同一repository transaction中保存。`inspect` MUST只返回保存的Receipt、applicability与observed time，MUST NOT重新执行这些observations。

#### Scenario: Development action 成功
- **WHEN** Application完成专业观察并形成合法Receipt与applicability
- **THEN** repository MUST原子保存两者并在commit前写后验证
- **AND** operation result MUST返回与数据库同一份保存applicability

#### Scenario: applicability 保存失败
- **WHEN** Receipt或applicability任一serialization、constraint、busy或post-read阶段失败
- **THEN** transaction MUST完整rollback并保留上一份Receipt与applicability
- **AND** MUST NOT留下新Receipt配旧applicability或反向组合

#### Scenario: 旧row没有可迁移observation
- **WHEN** 升级后的Development row有合法Receipt但applicability fields为空
- **THEN** inspect MUST返回保存Receipt与稳定unknown/migration diagnostic
- **AND** MUST NOT在GET中观察Environment、Git、Content Target或declaration补算

### Requirement: Task Development driver 必须提供同源调用契约发现

Task Development 内部 driver MUST 为每个受支持 action 提供无需 Task 或 Workspace 上下文的 action 级帮助、机器可读输入 schema 与最小输入示例。输入 schema MUST 是 closed JSON object shape，并且 Application 对该 action 的顶层字段白名单 MUST 与 driver 输出读取同一 action contract；发现操作 MUST NOT compose runtime、访问 Workspace、写入 Development Receipt 或产生其他专业副作用。

静态 schema MUST 区分结构约束与仍需 Application 结合 current Task、Environment、Change、identity 或专业 Result 判断的运行态约束。系统 MUST NOT把 schema 或示例解释为任意 Task 上均可执行的业务合法性证明。

#### Scenario: 查看全局帮助

- **WHEN** Agent 在没有 `--task` 和 `--target` 的情况下对 Task Development driver 请求 `--help`
- **THEN** driver MUST 返回所有受支持 action、公共执行参数以及 action 级 `--help`、`--schema`、`--example` 的发现方式
- **AND** 请求 MUST 不 compose runtime、不访问 Workspace且不产生持久化 effect

#### Scenario: 查看 action schema

- **WHEN** Agent 对一个受支持 action 请求 `--schema`
- **THEN** driver MUST 返回版本化 JSON envelope、action identity 与该 action 的 closed input JSON Schema
- **AND** schema 根对象的 properties MUST 与 Application 对同一 action 接受的顶层字段来自同一 contract

#### Scenario: 查看最小输入示例

- **WHEN** Agent 对一个受支持 action 请求 `--example`
- **THEN** driver MUST 返回版本化 JSON envelope与最小 `inputJson` 示例
- **AND** 无输入 action MUST返回空对象，含运行态占位值的示例 MUST 明确其仍需 current facts校验

#### Scenario: 普通 action 保持兼容

- **WHEN** Agent 不请求发现模式并执行任一现有 Task Development action
- **THEN** driver MUST继续要求 `--task` 与 `--target` 并返回原有 operation result或显式 profiling envelope
- **AND** Application、Development Receipt、Candidate、gate、decision与handoff语义 MUST保持不变

#### Scenario: 歧义或未知发现请求失败关闭

- **WHEN** 请求对未知 action 使用 action 级发现模式、缺少 action 请求 `--schema|--example`，或同时选择多个发现模式
- **THEN** driver MUST 返回usage error并以非零状态结束
- **AND** driver MUST不 compose runtime、不访问Workspace、不执行任何Task Development action

### Requirement: OpenSpec planning target 必须使用语义身份
Task Development consumer为OpenSpec planning登记target时 MUST使用Task Planning Identity Application返回的aggregate identity与artifact semantic nodes。Development Receipt继续只保存opaque target、最小node authority/reference/content identity/disposition/summary；MUST NOT保存semantic projection正文或自行解析Markdown。

#### Scenario: 仅执行进度或provenance改变
- **WHEN** resolver证明OpenSpec semantic target未变，但planning node的物理active/archive provenance或checklist完成事实发生变化
- **THEN** consumer MUST保持相同Planning Review target
- **AND** Development MUST NOT仅因此要求新的Planning Review Result

#### Scenario: resolver target变化或blocked
- **WHEN** resolver返回不同target或blocked diagnostic
- **THEN** consumer MUST分别把已有Planning Review视为stale或停止Development推进
- **AND** MUST NOT以旧target、raw artifact digest或手工摘要满足planning gate

### Requirement: Task Development 必须正式支持仅工作区 verification policy
Task Development MUST以Task Record中显式Project、Service所属Project与Change所属Project的确定性并集作为有效Project集合。只有该集合为空时，Application MUST允许policy保存空Project declarations，并 MUST要求唯一`scope: workspace` coverage gap、空capabilities与空overrides；有效Project集合非空时 MUST继续要求全部current Project declarations且拒绝workspace gap。

#### Scenario: 真正的workspace-only Task建立policy
- **WHEN** active Task没有Project、Service或Project-bound Change，matching ready Environment只提供workspace source，且Agent提交唯一workspace coverage gap
- **THEN** Development MUST形成绑定空declarations与该gap的稳定policy identity
- **AND** MUST不创建Project、declaration、capability、passed事实或第二authority

#### Scenario: Service或Change不能伪装workspace-only
- **WHEN** Task省略`scope.projects`但包含Service或Project-bound Change
- **THEN** Development MUST把所属Project纳入有效Project集合并要求其current declaration observation
- **AND** 空declarations或workspace coverage gap MUST被拒绝

#### Scenario: workspace policy派生current与stale
- **WHEN** 保存的workspace policy、Task有效Project集合与Content Target均未变化
- **THEN** Development MUST通过空declarations的纯值比较保持policy current
- **AND** Content Target变化 MUST使Candidate和handoff stale，新增Project/Service/Project-bound Change MUST使workspace policy stale并要求新的Project declarations

#### Scenario: workspace gap尚未形成Result
- **WHEN** workspace policy已记录coverage gap但Task Verification没有绑定同一Content Target、空declarations与workspace gap的current Result
- **THEN** Candidate freeze MUST blocked并返回Task Verification next action
- **AND** MUST不把policy gap本身解释为passed Result或合法waiver

#### Scenario: current workspace gap完成负向Verification
- **WHEN** Task Verification记录matching current `not-passed` Result及workspace gap
- **THEN** Development MAY在其他前置gate完整时freeze Candidate
- **AND** `proceed`与handoff仍 MUST绑定精确Verification Result digest、`scope: workspace`和明确授权source的风险接受，或使用现有明确gate disposition

#### Scenario: 旧Receipt保持兼容读取
- **WHEN** Workspace SQLite包含既有v1/v2/v3 Development Receipt或Project declarations非空的current policy
- **THEN** repository MUST按原兼容规则读取且 MUST不backfill workspace gap、迁移row或写旧File Store
- **AND** 新workspace policy MUST继续写入同一Task唯一SQLite current Receipt

### Requirement: Buildr Web 必须只读投影任务研发 read model
Buildr Web MUST 为正式 Task 提供只读“研发”视图，并 MUST 通过 Task Development Application `inspect` 展示 Development presence、最近一次正式 Development action 同row保存的适用性、planning nodes/dispositions、Task context、Content Target、verification policy、Candidate/generation、Planning/Verification/Completion gates、decision、明确风险与最近一次 Development handoff。HTTP 与 Web 层 MUST NOT 直接读取或解析 `development.yml`、重新计算 identity/currentness、复制专业 artifact/Result body、提供 Receipt mutation 或注册公共`buildr task development` CLI。`inspect` MUST只查询Development current row与读取terminal facts所需的Task/Finish current rows。

#### Scenario: 查看 current Development
- **WHEN** 保存的Development applicability status为`planning`、`developing`、`candidate-current`或`handoff-current`
- **THEN** 页面 MUST用中文分别显示“规划中”“研发中”“候选已就绪”或“研发交接已就绪”
- **AND** MUST将planning、Task context、Content Target、policy、Candidate与handoff的保存时current/stale/missing/disposition作为独立事实展示，不得在GET中改写Task Record或重新计算

#### Scenario: Development 尚未形成
- **WHEN** Application `inspect`返回`status: missing`且没有Development Receipt
- **THEN** 页面 MUST显示“尚未形成研发回执”的空状态
- **AND** 概览、证据和环境视图 MUST继续正常工作，不得创建空Receipt或提供浏览器写操作

#### Scenario: 只有planning facts
- **WHEN** Receipt已经记录proposal、design、review disposition或其他planning nodes，但Content Target仍为null
- **THEN** 页面 MUST展示节点authority、reference、disposition与适用的waiver来源，并显示“规划中”
- **AND** MUST NOT把尚未形成的Content Target、policy或Candidate显示为stale或failed

#### Scenario: 当前环境不可观察但历史交接存在
- **WHEN** Receipt存在但迁移后没有保存applicability，或observedAt早于已知外部变化
- **THEN** 页面 MUST保留展示planning、候选、决定和最近一次研发交接摘要，并明确显示“状态来自最近一次正式研发动作”或unknown
- **AND** 页面 MUST NOT在读取时重新观察Environment、Git、Content Target或declaration

#### Scenario: 安全读取 Development
- **WHEN** 客户端对已登记Workspace和真实Task发起`GET /api/v1/workspaces/:workspaceId/tasks/:taskId/development`
- **THEN** API MUST返回Task Development Application operation read model并使用no-store语义
- **AND** query参数、未知Task、POST、PUT、PATCH与DELETE MUST fail closed，且Task及全部专业current bytes MUST保持不变

#### Scenario: 展示最小研发信息
- **WHEN** Development Receipt包含长identity、多个planning nodes/handoff或专业Result reference
- **THEN** 页面 MUST默认只展示完整但次级排版的当前identity、节点disposition、候选代次、三个gate摘要、决定、风险数量和最近一次handoff
- **AND** MUST NOT展示开发日志、source diff、完整命令输出、隐藏推理、专业artifact/Result body或全部历史handoff列表

### Requirement: Task Development driver 必须提供紧凑 current 与 next-action 投影

Task Development 内部 driver MUST 在显式 compact 请求下，从同一次 `buildr.task-development-operation-result/v1` 生成 response-only `buildr.task-development-driver-compact/v1` 投影。投影 MUST保留 operation、status、Task ID、Receipt digest、保存的observed time、current applicability axes、相关planning/content/policy/Candidate/handoff identities、Candidate generation、current gates、decision、reasons、effects、diagnostic与next actions；MUST NOT创建第二authority、再次inspect Workspace或改变Application effect。

Next actions MUST只根据同一次Application已保存的Receipt与applicability给出建议性方向，MUST NOT执行专业动作、修改Task/Receipt/gate/Candidate或根据timing、调用次数和其他效率指标自动skip/advance。默认未请求compact时 MUST继续返回完整 `buildr.task-development-operation-result/v1`。

#### Scenario: 显式请求紧凑反馈
- **WHEN** Agent对一个普通Task Development action显式传入compact选项
- **THEN** driver MUST只执行一次对应Application action并返回版本化compact投影
- **AND** `current`与`nextActions` MUST来自该次完整operation result，不得额外观察或持久化

#### Scenario: 需要完整研发事实
- **WHEN** Agent未请求compact或需要读取完整Receipt snapshot
- **THEN** driver MUST保持现有完整operation result shape与authority
- **AND** compact projection MUST NOT替代Application、repository或Development Receipt

#### Scenario: 建议不能自动推进
- **WHEN** current facts指向Planning Review、Formal Verification、Completion Review、risk decision或Finish等下一阶段
- **THEN** result MAY返回对应建议动作
- **AND** Agent MUST仍按selected provider、专业Result与明确授权决定是否执行，指标不得成为gate

### Requirement: Formal Verification readiness 必须在稳定目标交接处只读派生
Task Development Application MUST在operation Result与compact projection中根据current Task Context、Planning、Content Target、verification policy、Candidate与Verification gate派生response-only `formalVerificationReadiness`，并 MUST区分`not-applicable|blocked|ready`。该摘要 MUST NOT写入Development Receipt、SQLite新slot、Candidate identity、Current Knowledge disposition或专业Result；Task Development MUST NOT解释current knowledge正文或执行Formal Verification。

#### Scenario: Change仍pending时拒绝观察稳定目标
- **WHEN** `observe`提交的完整Change dispositions中至少一项为`pending`
- **THEN** Application MUST在Content Target observation与Receipt写入前返回稳定blocked诊断并保留原current Receipt
- **AND** MUST要求先完成对应Change的实现、checklist与deterministic convergence/archive，不得把pending内容标记为stable target或冻结Candidate

#### Scenario: 无Change或明确不适用
- **WHEN** code-only或Workspace-only Task提交空Change列表，或者全部关联Change均为可证明的`converged`或明确`not-applicable`
- **THEN** `observe` MUST继续按现有Content Target规则工作，不得因预检强制创建Change、knowledge sidecar或额外验证能力
- **AND** 开发期focused/affected反馈与Task外transient verification MUST不消费该readiness

#### Scenario: 已知交接事实尚未稳定
- **WHEN** Task Context存在pending Change，或Planning、Content Target、verification policy任一已知missing/stale，或Candidate输入已经漂移
- **THEN** response-only readiness MUST为`blocked`，或在尚未到Candidate交接阶段时为`not-applicable`，并列出Development-owned最小reason code
- **AND** typed next MUST不把该状态伪装成可直接执行的Formal Verification

#### Scenario: 已知事实就绪但current knowledge需即时确认
- **WHEN** Change dispositions已处置，Planning、Content Target、policy与Candidate均current，matching Formal Verification仍缺失，但current knowledge disposition尚未形成
- **THEN** readiness MUST为`ready`并允许consumer把Candidate lease交给Task Verification
- **AND** Current Knowledge MAY在Verification前后独立形成；readiness MUST不推断provider结论或把knowledge未知持久化为blocked

#### Scenario: 尚未冻结Candidate
- **WHEN** stable Content Target与policy已经形成但current Candidate尚未冻结
- **THEN** readiness MUST为`not-applicable`且typed next MUST先指向Candidate freeze
- **AND** MUST不要求Current Knowledge或Verification先于Candidate形成

#### Scenario: Candidate已就绪且Verification缺失
- **WHEN** current Candidate、Task Context、Planning、Content Target与policy均current，且matching Formal Verification尚未形成
- **THEN** readiness MUST为`ready`并允许consumer把Candidate lease交给Task Verification
- **AND** Current Knowledge disposition MAY在Verification前后形成，不得固定为本次交接前置gate

#### Scenario: Candidate输入已漂移
- **WHEN** Candidate存在但Task Context、Planning、Content Target或policy任一不再current
- **THEN** readiness MUST为`blocked`并列出Development-owned最小reason code
- **AND** MUST不启动Formal Verification或把旧Candidate lease声明为current

#### Scenario: 已有matching Formal Verification
- **WHEN** Task Development已消费与current Candidate、Content Target、declarations和policy匹配的Verification Result
- **THEN** readiness MUST为`not-applicable`，后续next继续由Completion、Current Knowledge与decision规则决定
- **AND** MUST不要求重复Formal Verification或改变Candidate generation

### Requirement: Task Development 在 Content Target 前检查新增文本文件 EOF
Task Development Skill MUST 在内容固定且调用 `observe` 形成 Content Target 前，要求 Agent 检查 Task 本次新增的全部文本文件是否满足 required Core 的 EOF 不变量。Git-backed scope 的检查 MUST 覆盖 tracked-added 文件与未忽略的 untracked 文件；该动作 MUST NOT 扩大为未触达存量文件的批量清理。

#### Scenario: Git-backed Task 准备观察 Content Target
- **WHEN** Git-backed Task 已完成内容修改并准备调用 `observe`
- **THEN** Agent MUST 检查本次 tracked-added 与未忽略的 untracked 文本文件
- **AND** 每个被检查文件 MUST 恰好以一个换行符结束且不得包含末尾空白行
- **AND** Agent MUST 在检查通过后才调用 `observe`

#### Scenario: 新增文本文件存在末尾空白行
- **WHEN** Content Target 前置检查发现本次新增文本文件以额外空白行结束
- **THEN** Agent MUST 在调用 `observe` 前修正该文件
- **AND** 后续 Content Target 与验证证据 MUST 基于修正后的 bytes，不得复用与旧 bytes 绑定的证据

#### Scenario: 仓库存在未触达存量 EOF 问题
- **WHEN** Task scope 外或本次未新增的存量文本文件不满足 EOF 不变量
- **THEN** Task Development MUST NOT 仅为清理存量问题而扩大当前 Task 的 Content Target
- **AND** Agent MUST 继续对本次新增文件执行完整检查

### Requirement: Formal Verification 必须绑定 current Candidate
Development MUST 先建立stable Content Target与verification policy并冻结current Candidate，再由Task Verification workflow针对该Candidate形成current Result。Application MUST通过Task Verification Application inspect证明Candidate、target与declarations current，且policy要求的capability fact或coverage gap完整；Application本身MUST NOT执行formal Verification、写Verification Result或把`not-passed`改写为`passed`。

#### Scenario: current Result满足policy事实完整性
- **WHEN** Verification Application返回Result Candidate等于current Candidate、target等于current Content Target、declarations current，且required capability facts或明确coverage gap完整
- **THEN** Development MAY将Verification gate记为current并继续Completion Review与handoff判断
- **AND** Candidate value MUST NOT包含Result identity或digest

#### Scenario: Verification仍绑定旧Candidate或Content Target
- **WHEN** Result Candidate、generation、target或declaration applicability任一为stale/unknown
- **THEN** Verification gate MUST保持missing或stale并返回Task Verification reconciliation next action
- **AND** Development MUST NOT改写Result、applicability或伪造passed evidence

#### Scenario: Verification结论not-passed
- **WHEN** current Result完整但结论为`not-passed`
- **THEN** Development MAY保持Candidate current，但在没有绑定精确Verification Result digest、范围和授权来源的风险接受时 MUST记录blocked且不得形成handoff
- **AND** scoped risk MUST NOT把Verification事实改写为passed或使stale/incomplete Result适用

### Requirement: Task Development MUST provide current closed mutation input discovery

Task Development MUST provide a response-only `discover` action for `observe` and `policy`. The action MUST derive a versioned closed `inputJson` from current Task, ready Environment, Development Receipt and Task Verification declaration facts, and MUST NOT write a Development Receipt, applicability observation, Task Record or other professional Result.

#### Scenario: Discover observe input from current Receipt

- **WHEN** an active Task has a matching ready Environment and current Development Receipt
- **AND** the Agent requests `discover` for `observe`
- **THEN** the response MUST return `buildr.task-development-current-input/v1` and a closed `inputJson` containing the Receipt's complete Change dispositions and planning target identity
- **AND** the response MUST include the source Receipt identity and MUST report no write effect

#### Scenario: Discover policy input from current declarations

- **WHEN** an active Task has current Project verification declarations readable through Task Verification
- **AND** the saved policy is absent or its declaration identities are stale
- **THEN** the response MUST return every declaration capability usable for `task-delivery` with its default requiredness, a typed Project coverage gap when no such capability exists, and an empty `overrides` array
- **AND** the returned input MUST satisfy the existing `policy` mutation contract without embedding declaration authority fields

#### Scenario: Reuse an already current policy decision

- **WHEN** the saved policy declaration identities are current
- **THEN** discovery MUST preserve its capabilities, coverage gaps and explicit overrides in `inputJson`
- **AND** discovery MUST NOT silently replace a prior explicit policy decision with declaration defaults

#### Scenario: Discovery cannot prove current facts

- **WHEN** Task, Environment, Receipt or declaration facts are missing, stale or invalid
- **THEN** discovery MUST return a typed blocked diagnostic or fail closed
- **AND** it MUST NOT synthesize a static example as a substitute for current input or write any lifecycle fact

### Requirement: Task Development 必须在稳定目标后优先消费正式验证计划
当 Content Target current 且 verification policy 尚未 current 时，Task Development 的推荐下一步 MUST 指向先形成并复核 closed Formal Verification Plan，再从该 Plan 派生 policy 输入；只有 policy current 后才推荐 freeze Candidate。该推荐 MUST保持为可替代工作流，不得自动 prepare、写policy、freeze或执行验证，也不得阻止无关开发与有界非正式反馈。

#### Scenario: 稳定目标尚无policy
- **WHEN** active Task 的Planning gate与Content Target current，但verification policy missing或stale
- **THEN** `task next` MUST推荐由Task Verification先执行plan-and-derive-policy
- **AND** MUST不先推荐freeze或自动执行任何mutation

#### Scenario: Agent选择合法降级路径
- **WHEN** current Plan暂不可用但Agent仍在既有授权和安全边界内继续无关开发、focused feedback或声明默认policy发现
- **THEN** Buildr MUST不把Plan-first推荐升级为通用许可门禁
- **AND** 未形成matching Formal Verification authority前不得声称正式验证完成

### Requirement: Task Development policy discovery 必须消费Task Verification的closed投影
Task Development discover MUST允许调用方提供按有效Project完整覆盖的closed Formal Verification Plan documents，并 MUST只通过Task Verification Application取得Plan-derived policy input。它 MUST返回selected capabilities、coverage gaps、空默认overrides、response-only not-selected disposition与Plan/declaration identities；MUST不把Plan、preparation或not-selected摘要写入Development Receipt。

#### Scenario: current Plans完整覆盖Task
- **WHEN** 每个有效Project均提供identity、target、declaration和capability current的task-delivery Plan
- **THEN** discover MUST返回可直接交给policy writer的closed输入，并把Plan selected capability设为required
- **AND** MUST确定性列出current declaration中可用于task-delivery但未被Plan选择的capability

#### Scenario: Plan集合不完整或陈旧
- **WHEN** Project缺失、重复，或任一Plan的closed identity、target、declaration、capability不匹配current facts
- **THEN** discover MUST零写入失败并返回精确diagnostic
- **AND** MUST不回退猜测selected capability或静默使用旧policy

### Requirement: 多Project Current Knowledge必须按Project完整聚合
Task Development MUST只接受精确覆盖Task有效Project集合的Current Knowledge dispositions。每个Project disposition MUST绑定Project、current Content Target、`aligned|not-applicable|attention|blocked`、summary、source identities与bounded unresolved items；顶层Current Knowledge状态 MUST由完整Project集合确定性派生，且 MUST不复制知识正文。

#### Scenario: 每个Project均形成disposition
- **WHEN** 多Project Task的每个有效Project均提供绑定同一current Content Target的Current Knowledge result
- **THEN** Development MUST按Project排序保存最小disposition集合并形成Task级identity
- **AND** 非blocked的完整集合 MAY满足handoff的Current Knowledge前置

#### Scenario: 缺少一个Project
- **WHEN** Current Knowledge输入遗漏任一有效Project
- **THEN** Development MUST拒绝记录Task级current disposition并列出缺失Project
- **AND** MUST不让单Project aligned结果代表整个Task

#### Scenario: 任一Project blocked
- **WHEN** 任一Project disposition为blocked且包含completion-critical unresolved items
- **THEN** Task级Current Knowledge MUST为blocked并阻止handoff
- **AND** 其他Project aligned MUST保持可见但不得覆盖该blocker

### Requirement: Candidate必须绑定policy而非持久化Formal Plan集合
Task Candidate MUST继续绑定current verification policy identity，Formal Plan documents与Plan identities MUST保持transient且不得进入Candidate、Development Receipt或Verification Result。Formal execution MUST在各Project Execution Record内绑定Plan；Development MUST通过Result对policy required capabilities与coverage gaps的完整覆盖决定Verification gate是否可用。

#### Scenario: Result缺少policy required fact
- **WHEN** records均绑定合法Project Plans但Result缺少current policy中的required capability fact
- **THEN** Development MUST保持Verification coverage incomplete并阻止proceed/handoff
- **AND** MUST不因Plan本身ready或其他Project通过而满足gate

#### Scenario: 不同Plan产生相同完整policy facts
- **WHEN** Project Plan identity变化但current Candidate、target、declaration和policy required facts仍由matching terminal authority完整覆盖
- **THEN** Development MUST只按current Result与policy coverage判断gate
- **AND** MUST不建立第二Plan store或把Plan identity加入Candidate

### Requirement: 研发必须退出父子协调写入
研发 MUST 只维护独立研发事实，不再写父计划、贡献绑定或父验收，不要求贡献交接才能交付。历史字段及历史交接 MUST 保留可读，不作为新协调前置。

#### Scenario: 直接协调
- **WHEN** 父任务维护计划与子任务关系
- **THEN** MUST 不写研发回执。

#### Scenario: 旧内部动作
- **WHEN** 调用旧父子研发写动作
- **THEN** MUST 零写入报告退役。
