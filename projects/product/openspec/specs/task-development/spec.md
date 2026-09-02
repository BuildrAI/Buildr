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
Receipt MUST只包含`schemaVersion`、`taskId`、Environment逻辑引用`environment`、`taskContext`、`planning`、可为空的`contentTarget`、`generation`、`candidate`、Completion/Planning专业引用、`currentKnowledge`、`decision`、不可变`handoffs`、`createdAt`与`updatedAt`。Receipt MUST NOT保存verification policy、Task Verification Result/Report、verification gate、Formal Plan、Formal Verification Readiness、source diff、命令输出、绝对路径、Environment资源、聊天、隐藏推理、revision、锁或lease。

#### Scenario: 调用方提交Verification字段
- **WHEN** action input或持久Receipt包含`verificationPolicy`、verification gate、Task Verification digest、Formal Plan或readiness
- **THEN** Application MUST拒绝新写入值
- **AND** 历史Receipt MAY只读投影但MUST不再驱动current Development行为

#### Scenario: 调用方提交未知 authority 字段
- **WHEN** action input或持久Receipt包含progress、attempt、raw evidence、Result body、Git状态、Task Verification或其他未知authority字段
- **THEN** Application MUST拒绝整个值并保留原current
- **AND** MUST返回精确forbidden field diagnostic

#### Scenario: Content Target尚未形成
- **WHEN** Receipt只记录proposal、design、review disposition或其他planning facts
- **THEN** `contentTarget` MUST为null且inspect MUST返回missing applicability
- **AND** Candidate、decision与handoff MUST保持null或空数组

#### Scenario: 原子替换中断
- **WHEN** serialization、SQLite mutation或post-read任一阶段失败
- **THEN** Repository MUST rollback并保留原current Receipt与所有sibling records
- **AND** MUST NOT产生部分row、backup file或兼容YAML

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

### Requirement: Candidate identity 与generation必须只由Development生成
Application MUST只在Task context、stable Content Target与planning snapshot current且Change非pending时冻结Candidate。Candidate closed value与既有identity算法保持不变；Review、Verification与Current Knowledge均不得进入Candidate identity。Content Target或Task Context变化使Candidate失效；Review、Verification或Current Knowledge变化不得改变Candidate identity或generation。

#### Scenario: 首次冻结Candidate
- **WHEN** Development自身Candidate输入完整且当前没有Candidate
- **THEN** Application MUST生成generation 1与唯一Candidate identity
- **AND** Review/Verification Result、knowledge disposition、Environment identity、时间、branch或commit MUST NOT进入Candidate

#### Scenario: 已有current Candidate重复freeze
- **WHEN** Task Context与Content Target均未变化且current Candidate仍适用
- **THEN** freeze MUST幂等返回同一Candidate/generation
- **AND** MUST NOT因Review、Verification或knowledge变化递增generation

#### Scenario: 失效后形成下一代Candidate
- **WHEN** 旧Candidate已因Content Target或Task Context变化失效，新的事实重新满足freeze条件
- **THEN** Application MUST生成严格大于旧generation的新Candidate
- **AND** Receipt MUST只保留新current Candidate，既有正式handoff snapshots保持不可变

### Requirement: Development 必须独占proceed/blocked、scoped risk与Finish handoff
Task Development MAY根据current Candidate与current knowledge disposition形成`proceed|blocked` decision。只有current Candidate、非blocked Current Knowledge和绑定该Candidate的`proceed` decision同时成立时，Application MAY形成immutable handoff。新handoff MUST保存空planning/completion/verification gates与空risks；历史gate/risk只读decode，不得恢复为current准入。

#### Scenario: 全部正向gate满足且决定proceed
- **WHEN** current Candidate、非blocked Current Knowledge与proceed decision成立
- **THEN** Application MUST形成绑定Candidate、knowledge与decision的Finish handoff
- **AND** handoff MUST不包含Review/Verification Result、raw output、临时路径或delivery execution plan

#### Scenario: 用户接受负向Verification或Completion风险
- **WHEN** Review或Verification存在负向结论且用户决定继续研发交接
- **THEN** Agent MAY保留该专业事实并依据实际授权继续其他动作
- **AND** Development MUST不保存Result digest、risk acceptance或把专业结论改写为gate

#### Scenario: handoff后上游漂移
- **WHEN** planning snapshot、Content Target、Task context、Candidate或Current Knowledge变化
- **THEN** Application MUST清除current decision、判定旧snapshot不再current并返回task-development建议
- **AND** Review或Verification单独变化 MUST NOT使handoff失效

### Requirement: Task Development 必须覆盖完整正式研发区间
Task Development MUST从active Task的首个正式研发动作开始维护自身聚合事实，直到形成current Finish handoff。Proposal、design等planning节点存在时只保存专业authority、portable reference、identity与disposition；Task Review与Task Verification保持独立，不写入Development。

#### Scenario: 从 proposal 开始正式研发
- **WHEN** active Task在ready Environment中开始创建proposal且尚未形成Content Target
- **THEN** Development Application MUST原子建立Receipt与current planning snapshot
- **AND** Receipt MUST不创建Content Target、Candidate、Result gate、decision或handoff占位事实

#### Scenario: code-only Task 直接实现
- **WHEN** Task没有proposal、design或Change且首个正式研发动作为代码实现
- **THEN** Development MUST接受空planning nodes与空Change references并开始维护研发事实
- **AND** MUST NOT为了流程完整虚构OpenSpec、Review或其他节点

#### Scenario: 用户主动跳过节点
- **WHEN** 用户或具备业务授权的来源明确跳过一个适用planning节点
- **THEN** Development planning node MUST记录`waived`、目标、summary与authorization source
- **AND** MUST NOT把waiver写成Task Review、Verification或其他专业Result

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
Task Development consumer为OpenSpec planning登记target时 MUST使用Task Planning Identity Application返回的aggregate identity与artifact semantic nodes。Development Receipt只保存opaque target与最小nodes；Task Review可选地使用同一identity作为真实subject，但不是Development依赖。

#### Scenario: 仅执行进度或provenance改变
- **WHEN** resolver证明OpenSpec semantic target未变但provenance或checklist事实变化
- **THEN** consumer MUST保持相同Development planning target
- **AND** Agent自行判断是否需要新的Planning Review

#### Scenario: resolver target变化或blocked
- **WHEN** resolver返回不同target或blocked diagnostic
- **THEN** consumer MUST分别更新Development planning或停止对应Development mutation
- **AND** MUST NOT以旧target、raw artifact digest或手工摘要满足planning输入

### Requirement: Buildr Web 必须只读投影任务研发 read model
Buildr Web MUST通过Task Development Application `inspect`展示Development presence、保存的applicability、planning、Task context、Content Target、Candidate/generation、Current Knowledge、decision与最近handoff。页面 MUST不展示或解释Planning/Completion/Verification gate、Review Result或risk acceptance，也不提供Receipt mutation。

#### Scenario: 查看 current Development
- **WHEN** 保存的Development applicability status为`planning|developing|candidate-current|handoff-current`
- **THEN** 页面 MUST显示对应研发状态与自身facts
- **AND** MUST不从Review或Verification重算状态

#### Scenario: Development 尚未形成
- **WHEN** Application `inspect`返回missing
- **THEN** 页面 MUST显示尚未形成且不创建占位Receipt

#### Scenario: 只有planning facts
- **WHEN** Receipt只有planning nodes且Content Target仍为null
- **THEN** 页面 MUST展示节点authority、reference与disposition并显示规划中
- **AND** MUST不显示Review gate、waiver或尚未形成的Candidate错误

#### Scenario: 当前环境不可观察但历史交接存在
- **WHEN** Receipt只有最近一次保存的applicability或历史handoff
- **THEN** 页面 MUST保留展示planning、Candidate、decision与handoff摘要并标明保存时状态
- **AND** MUST不在GET中重新观察Environment、Git、Review或Verification

#### Scenario: 安全读取 Development
- **WHEN** 客户端发起Development GET
- **THEN** API MUST返回Application read model并使用no-store语义
- **AND** 非法参数、未知Task或写方法 MUST fail closed且零写入

#### Scenario: 展示最小研发信息
- **WHEN** Receipt包含长identity、多个nodes或handoff
- **THEN** 页面 MUST默认展示当前identity、节点、Candidate、Current Knowledge、decision与最近handoff
- **AND** MUST不展示gate摘要、风险数量、日志、diff、隐藏推理或专业Result body

### Requirement: Task Development driver 必须提供紧凑 current 与 next-action 投影
driver MAY从同一次Development operation result提供紧凑current与建议动作，但 MUST只依据Development自身事实，不推荐或要求Task Review/Verification作为推进门禁。

#### Scenario: 显式请求紧凑反馈
- **WHEN** Agent显式传入compact选项
- **THEN** driver MUST只执行一次对应Application action并返回版本化compact投影
- **AND** 不得额外读取Review或Verification

#### Scenario: 需要完整研发事实
- **WHEN** Agent未请求compact或需要完整Receipt
- **THEN** driver MUST保持完整operation result authority
- **AND** compact projection MUST NOT替代Application、repository或Receipt

#### Scenario: 建议不能自动推进
- **WHEN** current facts指向develop、freeze、knowledge、decision、handoff或report
- **THEN** result MAY返回对应建议动作
- **AND** MUST不返回Planning/Completion Review gate建议或自动推进

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

### Requirement: 研发必须退出父子协调写入
研发 MUST 只维护独立研发事实，不再写父计划、贡献绑定或父验收，不要求贡献交接才能交付。历史字段及历史交接 MUST 保留可读，不作为新协调前置。

#### Scenario: 直接协调
- **WHEN** 父任务维护计划与子任务关系
- **THEN** MUST 不写研发回执。

#### Scenario: 旧内部动作
- **WHEN** 调用旧父子研发写动作
- **THEN** MUST 零写入报告退役。

### Requirement: Task Development必须与Task Verification独立
Task Development MUST NOT声明、调用或依赖Task Verification Application、Persistence、Skill或capability；同样 MUST不依赖Task Review。Receipt、Candidate、decision、handoff与next action MUST不包含新的专业Result digest或gate。

#### Scenario: Development形成Candidate和handoff
- **WHEN** Task Development根据自身Task context、planning、Content Target和Current Knowledge形成Candidate或handoff
- **THEN** Application MUST不读取Task Verification或Task Review
- **AND** 两类Result缺失、失败、变化或损坏 MUST不阻止Development mutation

#### Scenario: Task Verification报告独立变化
- **WHEN** Agent新建、替换或使Task Verification报告stale
- **THEN** Development Receipt、Candidate generation、decision与handoff MUST保持不变
- **AND** Application MUST不把报告变化投影为Development gate变化

### Requirement: Development current input discovery不得编排任务验证
Task Development current input discovery MUST只返回Development自身合法mutation所需的current facts。它 MUST NOT接收Formal Plan文件、生成verification policy、调用Task Verification declaration observation或推荐verification run/reconcile。

#### Scenario: Content Target已经稳定
- **WHEN** current Content Target形成且Development需要下一动作
- **THEN** next action MAY继续Development自己的Review、Knowledge、Candidate或handoff流程
- **AND** MUST NOT把Task Verification设为结构性前置；Agent按独立Skill决定何时执行和记录验证

### Requirement: Task Development必须与Task Review独立
Task Development module MUST不依赖Task Review Application，不读取Review Result、不保存新的Planning/Completion gate，也不因Review缺失、结论或变化改变Candidate、Current Knowledge、decision或handoff。旧Receipt/Handoff gate只作历史decode。

#### Scenario: Review结果在Candidate后变化
- **WHEN** Agent新增或替换Task Review current Result
- **THEN** Development Receipt、Candidate generation和handoff MUST保持不变
- **AND** Development inspect MUST不报告Review blocker或推荐Review action

#### Scenario: 没有Review形成Candidate
- **WHEN** Development自身Task context、planning、Content Target和Change disposition满足Candidate条件
- **THEN** freeze MUST形成或复用Candidate
- **AND** MUST不调用Review Application或补造not-applicable gate
