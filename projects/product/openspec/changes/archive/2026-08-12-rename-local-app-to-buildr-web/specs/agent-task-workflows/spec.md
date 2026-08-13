## ADDED Requirements

### Requirement: task-manager Skill 必须作为 Buildr Web 与 CLI 共享的 Task Record 薄管理入口
Buildr MUST交付名为 `task-manager` 的 workspace Skill，并 MUST用精确 routing description 将它限制在 Agent 对正式 Task Record 的创建、按 Task ID 恢复、查看、更新和结束；Skill MUST通过 selected `buildr.task-record/v1` provider 执行，不得成为全局任务 dispatcher。Buildr Web MUST作为同一 Task Record Application 的独立人类客户端，不通过 Skill routing 写记录；任一客户端 MUST NOT直接访问 SQLite、SQL 或 migration scripts。

#### Scenario: 用户明确管理正式 Task
- **WHEN** 用户要求创建正式 Task、查看或修改 Task 顶层事实、按 Task ID 恢复或结束 Task
- **THEN** Agent MUST使用 `task-manager` 并报告实际 operation、Task ID、status 和 effects
- **AND** 后续 Environment、Development、Review、Verification、Git、Finish、Board 与 Retrospective MUST继续由各自专业能力负责

#### Scenario: 用户按 Task ID 继续工作
- **WHEN** 用户或 Agent 提供已有 Task ID 并要求恢复或继续
- **THEN** `task-manager` MUST先 inspect canonical Task Record
- **AND** MUST只从 title、intent、scope、changes、status 和 result 恢复顶层事实，不得从 Task Record 推断运行环境、数据库结构或专业阶段状态

#### Scenario: 人先在 Buildr Web 创建 Task
- **WHEN** 用户在 Buildr Web 创建 active Task，随后要求 Agent 按该 Task ID 继续
- **THEN** `task-manager` MUST inspect 同一 canonical logical Task Record 并核对 intent/scope
- **AND** MUST NOT重新 create、把 Buildr Web 记录视为低权威副本或要求用户重复输入顶层事实

#### Scenario: 普通任务请求
- **WHEN** 用户只提出修复、实现、重构、文档、测试、纯讨论或只读探索
- **THEN** `task-manager` MUST NOT仅因出现“任务”而抢占入口
- **AND** Agent MUST先按现有语义入口判断是否已经形成正式持久交付 Task

#### Scenario: Skill 返回存储细节
- **WHEN** Task action 成功或 blocked
- **THEN** `task-manager` MUST只报告 Application 的领域结果、digest、effects、diagnostic 和 nextActions
- **AND** MUST NOT要求用户编辑 SQLite、运行 SQL、修改 migration ledger 或处理 database path

### Requirement: Buildr Web、人、Agent 与产品必须分担语义和确定性逻辑
通过 Agent 工作时，Agent MUST 负责理解用户意图、判断是否形成正式 Task、形成 title/intent 与选择专业能力；人也 MAY 在 Buildr Web 中直接表达 Task 顶层事实。Task Record Application MUST 对所有客户端负责 schema、默认值、引用解析、字段变更、状态转换、系统时间、陈旧页面拒绝和文件 effects。Skill MUST NOT 要求 Agent 手写 YAML、持久 revision 协议或任意 next state。

#### Scenario: 创建与更新参数
- **WHEN** Agent 已确认要创建或修改 Task 顶层事实
- **THEN** Agent MUST 只提供命令要求的明确业务参数
- **AND** 产品 MUST 生成其余系统字段并拒绝非法组合

#### Scenario: 人通过 Buildr Web 管理 Task
- **WHEN** 人在 Buildr Web 创建、编辑、完成或放弃 Task
- **THEN** 页面 MUST 收集明确业务字段与终态确认，并调用同一 Application action
- **AND** MUST NOT 依赖 Agent 临场生成 YAML、校验引用、计算状态迁移或执行 filesystem 写入

#### Scenario: 专业模块返回事实
- **WHEN** Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective provider 返回结果
- **THEN** `task-manager` MUST NOT 将专业 result、path、revision 或运行状态复制到 Task Record
- **AND** 只有 title、intent、scope、Change reference 或最终 summary 真正变化时才调用相应 Task Record action

### Requirement: Formal Finish 成功后的 Buildr Web 自举 activation 失败不得改写研发与交付事实
Workspace专属self-bootstrap activation MUST位于Formal Finish成功之后。成功 MUST证明默认 PATH `buildr`绑定本次delivered retained checkout且最终Workspace Doctor ready；安装失败、默认CLI identity不一致或最终Doctor失败 MUST明确报告“主任务已交付、自举Workspace激活未完成”、失败动作与恢复事实，并 MUST NOT改写Finish Result、Candidate、Verification、Review、decision、handoff、Task Record或Environment cleanup。

#### Scenario: CLI activation失败
- **WHEN** Formal Finish已complete且post-Finish development CLI安装、默认入口identity验证或默认入口启动失败
- **THEN** Finish Result MUST保持complete且Environment MUST保持cleaned
- **AND** Agent MUST返回精确失败与恢复入口，不得重跑Formal Verification、生成Candidate或重新执行Finish

#### Scenario: Buildr Web activation失败
- **WHEN** Formal Finish已complete且development Buildr Web安装失败
- **THEN** Agent MUST保留主任务已交付事实并报告自举activation未完成
- **AND** MUST NOT触碰稳定版Buildr Web或修改共享历史

#### Scenario: 默认CLI与最终Doctor共同通过
- **WHEN** Formal Finish已complete且所有适用post-Finish动作成功
- **THEN** self-bootstrap activation MUST仅在默认PATH `buildr`可证明绑定delivered retained checkout且通过该入口运行的最终指定Agent Doctor ready时成功
- **AND** Agent MUST NOT以源码CLI成功、`command -v`命中同名命令或`--help`可启动替代该证明

## MODIFIED Requirements

### Requirement: P0.1 必须切换 Task Record authority，但不抢占专业 authority
P0.1 实现完成、集成并投射到 retained runtime 后，新正式 Task MUST 使用 Task Record Application 与 canonical Task Record 作为顶层 Task authority；`task-manager` 与 Buildr Web 只是两个客户端，该能力 MUST NOT 标记为 preview。当前 Environment、Verification、Finish、Board、Asset Review 与 Git 模块 MUST 继续拥有各自专业事实，直到对应模块 Change 当场完成替换。

#### Scenario: P0.1 已在 retained runtime 生效
- **WHEN** Agent 开始新的正式持久交付 Task
- **THEN** task-triage/正式执行入口 MUST 先建立 Task Record
- **AND** MUST NOT 同时创建第二份旧顶层 Task record

#### Scenario: 调用尚未替换的专业模块
- **WHEN** active Task 在 P0.2/P0.4/P0.6/P0.8/P1/P2 前调用当前 Environment、Verification、Git、Finish、Board 或 Asset Review
- **THEN** 当前 provider MUST 继续维护其专业 receipt/result/store
- **AND** Task Manager MUST 不复制、不索引、不解释这些专业数据

#### Scenario: 后续模块达到旧 authority
- **WHEN** 后续 Change 实现与现有模块事实重叠的新 authority
- **THEN** 该 Change MUST 同时迁移或保留必要历史读取、切换 consumer/routing 并删除或关闭旧 mutation path
- **AND** MUST NOT 把已知清退工作统一延迟到完整主闭环之后

### Requirement: task-development Skill 必须编排P0.5 authority顺序
Buildr MUST交付`task-development` Workspace Skill并提供`buildr.task-development@2`。Skill MUST从proposal、design或直接实现等首个正式研发动作开始维护planning current snapshot，在内容稳定后建立Content Target与policy、调用formal Verification、冻结Candidate、按适用性调用或明确处置Completion Review，并形成decision/handoff；它 MUST通过内部Application driver工作且 MUST NOT新增公共CLI或Buildr Web writer。

#### Scenario: OpenSpec planning入口登记事实
- **WHEN** active Task在ready Environment中创建或更新proposal/design
- **THEN** OpenSpec sidebar MUST先调用Development begin或planning action，并在artifact形成后登记其专业authority、portable reference与identity
- **AND** MUST NOT把artifact正文复制到Development Receipt

#### Scenario: Change任务进入Candidate准备
- **WHEN** active Task包含0..N Change且实现已完成
- **THEN** Skill MUST在Content Target观察前完成适用Change sync/archive/current knowledge/runtime fixed point，并把已有proposal/design/Review等专业facts登记到current planning snapshot
- **AND** 任一内容mutation发生后 MUST重新观察target，不能复用先前Verification

#### Scenario: 无Change普通Workspace进入Candidate准备
- **WHEN** active Task没有OpenSpec且首个正式研发动作为代码实现
- **THEN** Skill MUST以空planning nodes建立Development Receipt并允许实现继续
- **AND** MUST NOT要求proposal、Planning Review、Product code、Service code、Git ref、Node/npm或OpenSpec executable

#### Scenario: runtime发现Development
- **WHEN** supported Agent runtime完成Buildr sync/render
- **THEN** runtime MUST发现`task-development` Skill、`buildr.task-development@2` contract与binding
- **AND** MUST不同时投射v1 provider或旧Finish-owned Candidate/Verification路由

### Requirement: 通用 Task Finish 不得执行 Buildr development 产品安装
通用 Task Finish MUST只保留current Development handoff消费、Task Contribution、Delivery Baseline、Delivery Carrier、carrier equivalence、fast-forward或普通push、远端回读、必要retained runtime render、指定Agent retained Doctor与Environment cleanup。它 MUST NOT安装默认Buildr CLI、安装或更新`Buildr Web Dev.app`、硬编码development launcher channel，或根据Product源码路径推断本机产品安装。retained Doctor MUST使用run identity绑定的Agent并要求`health.ready: true`；通用Product executor MUST不识别self-bootstrap Component、执行sync或自动改变Doctor失败结论。

#### Scenario: 普通用户 Workspace 完成交付
- **WHEN** 未安装`buildr-self-bootstrap` Component的用户Workspace完成Formal Task Finish
- **THEN** Finish MUST执行通用交付、指定Agent Doctor与cleanup，并观察到CLI installer和Buildr Web installer调用次数都为零
- **AND** Doctor不ready时 MUST保持blocked，不要求`projects/product/buildr`存在或访问`/Applications/Buildr Web Dev.app`

#### Scenario: Buildr源码路径进入共用Finish
- **WHEN** Task Contribution包含Buildr CLI、Product Skill或Buildr Web实现路径
- **THEN** 共用Finish MUST仍只执行通用activation与指定Agent Doctor
- **AND** MUST NOT自行执行development CLI、Buildr Web或package sync；是否尝试自举恢复只由Workspace append决定

#### Scenario: 通用 Workspace Doctor 不 ready
- **WHEN** retained指定Agent Doctor返回非零或`health.ready`不为true
- **THEN** Common Finish MUST阻塞deliver且不得进入cleanup
- **AND** MUST保留Doctor findings、partial delivery与精确resume事实，不得自行把self-bootstrap可能性解释为成功

## REMOVED Requirements

### Requirement: task-manager Skill 必须作为 Task Record 的薄管理入口
Buildr MUST交付名为 `task-manager` 的 workspace Skill，并 MUST用精确 routing description 将它限制在 Agent 对正式 Task Record 的创建、按 Task ID 恢复、查看、更新和结束；Skill MUST通过 selected `buildr.task-record/v1` provider 执行，不得成为全局任务 dispatcher。Local App MUST作为同一 Task Record Application 的独立人类客户端，不通过 Skill routing 写记录；任一客户端 MUST NOT直接访问 SQLite、SQL 或 migration scripts。

#### Scenario: 用户明确管理正式 Task
- **WHEN** 用户要求创建正式 Task、查看或修改 Task 顶层事实、按 Task ID 恢复或结束 Task
- **THEN** Agent MUST使用 `task-manager` 并报告实际 operation、Task ID、status 和 effects
- **AND** 后续 Environment、Development、Review、Verification、Git、Finish、Board 与 Retrospective MUST继续由各自专业能力负责

#### Scenario: 用户按 Task ID 继续工作
- **WHEN** 用户或 Agent 提供已有 Task ID 并要求恢复或继续
- **THEN** `task-manager` MUST先 inspect canonical Task Record
- **AND** MUST只从 title、intent、scope、changes、status 和 result 恢复顶层事实，不得从 Task Record 推断运行环境、数据库结构或专业阶段状态

#### Scenario: 人先在 Local App 创建 Task
- **WHEN** 用户在 Local App 创建 active Task，随后要求 Agent 按该 Task ID 继续
- **THEN** `task-manager` MUST inspect 同一 canonical logical Task Record 并核对 intent/scope
- **AND** MUST NOT重新 create、把 Local App 记录视为低权威副本或要求用户重复输入顶层事实

#### Scenario: 普通任务请求
- **WHEN** 用户只提出修复、实现、重构、文档、测试、纯讨论或只读探索
- **THEN** `task-manager` MUST NOT仅因出现“任务”而抢占入口
- **AND** Agent MUST先按现有语义入口判断是否已经形成正式持久交付 Task

#### Scenario: Skill 返回存储细节
- **WHEN** Task action 成功或 blocked
- **THEN** `task-manager` MUST只报告 Application 的领域结果、digest、effects、diagnostic 和 nextActions
- **AND** MUST NOT要求用户编辑 SQLite、运行 SQL、修改 migration ledger 或处理 database path

### Requirement: 人、Agent 与产品必须分担语义和确定性逻辑
通过 Agent 工作时，Agent MUST 负责理解用户意图、判断是否形成正式 Task、形成 title/intent 与选择专业能力；人也 MAY 在 Local App 中直接表达 Task 顶层事实。Task Record Application MUST 对所有客户端负责 schema、默认值、引用解析、字段变更、状态转换、系统时间、陈旧页面拒绝和文件 effects。Skill MUST NOT 要求 Agent 手写 YAML、持久 revision 协议或任意 next state。

#### Scenario: 创建与更新参数
- **WHEN** Agent 已确认要创建或修改 Task 顶层事实
- **THEN** Agent MUST 只提供命令要求的明确业务参数
- **AND** 产品 MUST 生成其余系统字段并拒绝非法组合

#### Scenario: 人通过 Local App 管理 Task
- **WHEN** 人在 Local App 创建、编辑、完成或放弃 Task
- **THEN** 页面 MUST 收集明确业务字段与终态确认，并调用同一 Application action
- **AND** MUST NOT 依赖 Agent 临场生成 YAML、校验引用、计算状态迁移或执行 filesystem 写入

#### Scenario: 专业模块返回事实
- **WHEN** Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective provider 返回结果
- **THEN** `task-manager` MUST NOT 将专业 result、path、revision 或运行状态复制到 Task Record
- **AND** 只有 title、intent、scope、Change reference 或最终 summary 真正变化时才调用相应 Task Record action

### Requirement: Formal Finish成功后的自举activation失败不得改写研发与交付事实
Workspace专属self-bootstrap activation MUST位于Formal Finish成功之后。成功 MUST证明默认 PATH `buildr`绑定本次delivered retained checkout且最终Workspace Doctor ready；安装失败、默认CLI identity不一致或最终Doctor失败 MUST明确报告“主任务已交付、自举Workspace激活未完成”、失败动作与恢复事实，并 MUST NOT改写Finish Result、Candidate、Verification、Review、decision、handoff、Task Record或Environment cleanup。

#### Scenario: CLI activation失败
- **WHEN** Formal Finish已complete且post-Finish development CLI安装、默认入口identity验证或默认入口启动失败
- **THEN** Finish Result MUST保持complete且Environment MUST保持cleaned
- **AND** Agent MUST返回精确失败与恢复入口，不得重跑Formal Verification、生成Candidate或重新执行Finish

#### Scenario: Local App activation失败
- **WHEN** Formal Finish已complete且development Local App安装失败
- **THEN** Agent MUST保留主任务已交付事实并报告自举activation未完成
- **AND** MUST NOT触碰稳定版Local App或修改共享历史

#### Scenario: 默认CLI与最终Doctor共同通过
- **WHEN** Formal Finish已complete且所有适用post-Finish动作成功
- **THEN** self-bootstrap activation MUST仅在默认PATH `buildr`可证明绑定delivered retained checkout且通过该入口运行的最终指定Agent Doctor ready时成功
- **AND** Agent MUST NOT以源码CLI成功、`command -v`命中同名命令或`--help`可启动替代该证明
