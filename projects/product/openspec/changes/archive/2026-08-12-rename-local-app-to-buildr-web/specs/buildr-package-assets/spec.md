## ADDED Requirements

### Requirement: Package 必须原子交付 Buildr Web Task Manager 能力
Buildr package MUST 原子交付 Task Record Domain/Application/repository、`buildr.task-record/v2` capability contract、默认 `task-manager` provider、workspace binding、Skill source、CLI/help/runtime 接线、Buildr Web Task routes/API/Web assets 和公开 JSON identity；任一 identity、path、version、binding 或 Application client 接线不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr 将包含 Task Manager 的 package 初始化或同步到 Workspace
- **THEN** workspace Skills manifest MUST 登记 `buildr.task-record@2` contract、`task-manager` Skill 与 default binding
- **AND** task-manager MUST 通过 `provides` 声明 `buildr.task-record@2`

#### Scenario: capability contract identity 不一致
- **WHEN** package manifest、workspace baseline manifest、contract frontmatter、provider provides 或 binding 对 capability id/version 的声明不一致
- **THEN** package check 和 doctor MUST 报告 identity integrity error
- **AND** runtime projection MUST NOT 猜测其中一份 identity 继续绑定

#### Scenario: 支持的 Agent runtime 投射 Task Manager
- **WHEN** retained Workspace 从已集成的产品 source 对支持的 Agent runtime 执行 sync/render
- **THEN** runtime MUST 收到完整 task-manager Skill、更新后的 task-triage 与受管 source/binding evidence
- **AND** doctor MUST 只在 contract、provider、consumer binding 和 runtime source 都可解析时报告 structurally ready

#### Scenario: bundled Buildr Web 加载 Task 页面
- **WHEN** checkout、npm tarball 或平台 bundle 启动 Buildr Web 并打开已登记 Workspace
- **THEN** server MUST 交付 Task route shell、Task Web feature 与对应 Workspace-scoped API
- **AND** Buildr Web 与 CLI MUST 绑定同一 Task Record Application，不得各自携带独立 validator 或 filesystem writer

### Requirement: task-manager routing 与 Buildr Web 职责边界必须由 package verification 保护
Buildr package MUST 让 task-manager frontmatter、package manifest 与 workspace baseline manifest 使用完全一致的单句 description，并 MUST 通过静态与行为 fixture 防止它退化为全局 dispatcher、专业阶段执行器或复盘分析 owner。

#### Scenario: routing description 正向覆盖
- **WHEN** fixture 表达创建、查看、更新、激活、结束 todo/active Task Record 或按 Task ID 恢复顶层事实
- **THEN** task-manager description MUST 覆盖该意图
- **AND** Skill 正文 MUST 要求使用 selected `buildr.task-record/v2` provider 和实际 result evidence

#### Scenario: routing description 负向覆盖
- **WHEN** fixture 只表达普通修复/实现意图、纯讨论、只读探索、单次测试、临时服务或 Agent host task/thread 管理
- **THEN** package verification MUST 确认 task-manager 不自动创建 Task
- **AND** task-triage 或其他适用入口 MUST 不因新 Skill id 被遮蔽

#### Scenario: 专业职责渗入
- **WHEN** task-manager Skill 或 contract 包含 Environment 创建/记录、研发计划/实现、Review 判断、Verification 执行、Git policy、Finish 编排、Board 状态或复盘内容分析
- **THEN** package verification MUST 失败并报告越界内容
- **AND** provider MUST 只拥有 Task Record 六个 action、最小来源关系与结果证据

#### Scenario: Buildr Web 前端复制产品逻辑
- **WHEN** Task Web feature 自行实现状态迁移、关系校验或直接接受 filesystem path
- **THEN** package/static verification MUST 失败并报告重复 authority
- **AND** Web feature MUST 只调用登记的 Workspace Task API 并展示 Application result

### Requirement: Package 必须原子交付 Buildr Web Task Environment authority
Buildr package MUST原子交付`buildr.task-environment/v1` contract、Task Environment Application、Plan v1/Receipt v4 Domain、`task-environment` Skill、Plan/Environment公共CLI与JSON、v2/v3 compatibility reader、唯一SQLite writer、Task-scoped Change Resolver、Buildr Web saved-current reader/API、Git provider contract、bindings、runtime mappings与迁移验证。任一identity、schema、CLI、source/package/runtime或Buildr Web consumer不一致时package check与doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr初始化或同步包含Task Environment的Workspace
- **THEN** manifests MUST登记matching contract、provider和bindings
- **AND** MUST不交付Project dependency declaration parser或package-manager adapter registry

#### Scenario: capability graph 解析
- **WHEN** doctor解析task-triage、task-environment、task-worktree与task-finish
- **THEN** graph MUST显示正式workflow消费task-environment，Environment按需消费Git provider
- **AND** 旧capability、缺失provider、歧义或版本冲突 MUST产生精确诊断

#### Scenario: 公共 Task Environment CLI 完整登记
- **WHEN** verification检查help、CLI和public JSON registry
- **THEN** Plan record/inspect及Environment prepare/inspect/cleanup MUST全部出现并匹配各自schema
- **AND** internal resource/saved-current actions MUST不出现

#### Scenario: Buildr Web只读保存事实
- **WHEN** checkout或npm tarball Buildr Web读取Environment
- **THEN** GET MUST通过Application展示v4 Plan/Service/Step facts或legacy diagnostic
- **AND** MUST不执行Step、文件系统probe或Receipt写入

#### Scenario: 候选package在隔离Workspace证明fresh依赖
- **WHEN** candidate CLI作为外部controller为fresh fixture携带包含buildr/buildr-web步骤的Agent Plan执行prepare
- **THEN** 一次prepare MUST产生两个独立Service Step outputs并使`npm run build:web`使用buildr-web lockfile工具成功
- **AND** 同一机制 MUST能执行非npm fixture step而无需新增技术栈adapter

#### Scenario: 候选 package 在自身验证工作区测试
- **WHEN** Task worktree候选修改Plan、Receipt、CLI、Skill或Buildr Web assets
- **THEN** candidate MAY只向receipt绑定验证工作区投射
- **AND** MUST阻止retained、peer Task与验证根外共享runtime target

#### Scenario: 集成后激活
- **WHEN** 候选进入retained checkout
- **THEN** Agent MUST从retained Product source执行适用sync/render/doctor
- **AND** 只有package/runtime identity一致且专项验证通过后才能报告正式生效

### Requirement: Buildr 自举 Component 必须统一执行 Buildr Web post-Finish activation
Buildr自举Workspace的`buildr-self-bootstrap` Component MUST通过单一专属Skill执行self-bootstrap activation。该Skill MUST只消费同一Finish run中冻结的Task Contribution paths，并 MUST按封闭路径分类去重组合package sync、development CLI install、development Buildr Web install、默认CLI identity验证与最终Doctor/Finish resume；它 MUST NOT从HEAD、dirty tree、当前diff或时间重新猜测贡献。Formal Finish首轮Doctor通过时activation位于complete之后；首轮Doctor blocked时，只有前序delivery/remote evidence、matching resume token和适用动作全部成立，activation才可以先修复retained状态并恢复同一run。

#### Scenario: 普通源码或文档变化
- **WHEN** 冻结Task Contribution未命中package、CLI或Buildr Web正式影响路径
- **THEN** self-bootstrap activation MUST返回`not-applicable`
- **AND** MUST不覆盖Doctor failure、不执行sync、CLI install、Buildr Web install或默认CLI identity验证

#### Scenario: CLI影响路径
- **WHEN** complete或Doctor-blocked Finish Result的冻结Task Contribution命中Buildr CLI正式影响路径
- **THEN** self-bootstrap activation MUST使用Environment Receipt绑定的retained Node/CLI identity安装development CLI，并在所有适用安装动作后验证PATH实际命中的默认入口
- **AND** 通用Product executor本身 MUST观察到CLI installer调用次数为零

#### Scenario: Buildr Web影响路径
- **WHEN** complete或Doctor-blocked Finish Result的冻结Task Contribution命中Buildr Web正式影响路径
- **THEN** self-bootstrap activation MUST去重满足CLI依赖并安装development Buildr Web，launcher identity MUST绑定delivered retained commit
- **AND** MUST不安装或覆盖稳定版Buildr Web

#### Scenario: package workspace inputs
- **WHEN** 冻结Task Contribution命中package manifest或workspace package targets
- **THEN** self-bootstrap activation MUST执行retained sync，只提交受管sync delta，并通过普通push与远端回读完成收敛
- **AND** package sync MUST不与CLI或Buildr Web分类重复执行相同动作

#### Scenario: 多种影响同时命中
- **WHEN** 同一冻结Task Contribution同时命中package、CLI和Buildr Web路径
- **THEN** 单一self-bootstrap activation MUST分别至多执行一次sync、CLI install、Buildr Web install、默认CLI identity验证和最终Doctor或Finish resume
- **AND** MUST不启动第二个orchestrator或持久化新的workflow state

#### Scenario: 默认CLI identity通过
- **WHEN** 任一self-bootstrap动作适用且所有安装动作已经完成
- **THEN** runner MUST按PATH顺序解析实际命中的`buildr`，证明其入口链绑定本次delivered retained checkout的`scripts/run-development-cli`与`bin/buildr.mjs`
- **AND** runner MUST通过该入口执行`version --json`并核对retained `package.json`中的package/version

#### Scenario: 默认CLI identity失败
- **WHEN** PATH无`buildr`、被其他命令抢占、symlink指向旧checkout、launcher或CLI entry链路不匹配、版本不一致或命令启动失败
- **THEN** self-bootstrap activation MUST fail closed并停止最终Doctor或Finish resume
- **AND** Result MUST保留实际PATH命中、预期与观测入口及精确恢复事实

#### Scenario: Doctor-blocked run恢复
- **WHEN** 同一run的前序交付完整、唯一失败为retained Doctor、存在matching resume token且至少一个self-bootstrap动作适用
- **THEN** 专属Skill MUST在动作和默认CLI identity验证成功后，通过已验证默认入口用该token恢复同一Finish run，由resume中的指定Agent Doctor形成最终结论
- **AND** MUST不额外运行第二个最终Doctor、不创建新orchestrator或持久化新的workflow state

#### Scenario: Formal Finish已经complete
- **WHEN** 首轮指定Agent Doctor、cleanup与Formal Finish已经成功且至少一个self-bootstrap动作适用
- **THEN** 专属Skill MUST在post-Finish动作和默认CLI identity验证后，通过已验证默认入口显式运行一次最终指定Agent Doctor
- **AND** 任一动作即使被多条路径命中也 MUST至多执行一次

### Requirement: 产品验证必须覆盖 Buildr Web Environment authority 与清理
Buildr product verification MUST 覆盖 Task Record gate、共享执行根、单/多 repo Git provider、Runtime/CLI/依赖准备、runtime projection、Task-scoped Change 解析、Buildr Web Environment inspect、资源登记、串行恢复、Finish cleanup handoff与明确放弃，并 MUST 证明所有正式 consumer 只读写 Workspace SQLite Environment current authority。

#### Scenario: checkout 与 npm package 正常路径
- **WHEN** verifier 分别从 checkout 和 npm tarball 初始化临时 Workspace 并执行正式 Task 环境流程
- **THEN** 两者 MUST 产生等价的 Task Environment contract/result、SQLite current row、provider evidence 与 ready/cleanup 语义
- **AND** 只允许 machine path、时间、进程和下载缓存等真实本机事实不同

#### Scenario: Buildr 自举依赖准备
- **WHEN** 干净 task checkout 没有 `node_modules` 且候选 CLI probe 失败
- **THEN** retained stable controller MUST 使用 Workspace Node/npm 与 checkout 自己的 lockfile 完成 `npm ci` 后重新 probe
- **AND** verifier MUST 证明 retained/peer `node_modules` 未被复用、链接或修改

#### Scenario: 动态资源登记失败
- **WHEN** preview/dev server 已启动但 Environment writer 拒绝登记
- **THEN** creator MUST 停止刚创建的 owned process/resource 并返回失败
- **AND** current row、其他 previews、默认 Buildr Web 与其他任务 MUST 保持不受影响

#### Scenario: Task-scoped Change 与 Buildr Web Environment
- **WHEN** Change 只存在于 matching Task Environment Project root，且用户打开该 Task 详情
- **THEN** Task Record reference 与 task-scoped Change detail MUST 返回 candidate provenance，环境页签 MUST 通过 Application `inspect` 返回当前机器的有界 probe
- **AND** 全局 Change list MUST 保持 retained-only，Web/HTTP MUST 不直接读取 Receipt store 或接受任意 filesystem path

#### Scenario: 正常 Finish 与放弃 cleanup
- **WHEN** fixture 分别提供已交付 normal handoff、明确 abandon authorization 和 ownership 不明 shared root
- **THEN** Environment MUST 分别完成安全清理、清理可证明的 Task-owned dirty 资源、对不明 shared content 返回 blocked/retained
- **AND** Task Finish MUST 不直接调用 worktree cleanup、重复交付或写第二份 cleanup 结论

#### Scenario: 防止文件 authority 回退
- **WHEN** package/static/runtime verification 发现旧 environment writer、文件 importer、`worktree context/adopt` guidance、adoption receipt、environment-shaped worktree JSON/help 或 consumer direct edge 任一仍可达
- **THEN** verification MUST 失败并报告具体冲突入口
- **AND** legacy identity 只 MAY 出现在 OpenSpec archive/history，Buildr runtime、sync 与 package tests MUST NOT保留迁移 reader

### Requirement: 产品验证必须覆盖 Task Manager package、CLI 与 Buildr Web parity
Buildr package verification MUST 在 checkout、初始化 Workspace、同步 Workspace、隔离 runtime、Buildr Web browser 与 npm tarball 场景覆盖 contract/Skill、todo/active 状态、来源关系、CLI registry/help、Buildr Web route/API/assets、public JSON、filesystem effect 和失败分支，并 MUST 在任一入口行为漂移时失败。

#### Scenario: checkout 与 tarball 成功路径
- **WHEN** verifier 分别使用 checkout CLI 与 npm tarball CLI 对等执行 create/inspect/update/activate/complete/abandon 及来源关系 mutation
- **THEN** 两者 MUST 使用相同 command help、record/result schema 与状态语义
- **AND** todo 创建 MUST 证明除 SQLite owner rows 外无 filesystem 或专业副作用

#### Scenario: checkout 与 tarball 失败路径
- **WHEN** verifier 分别触发重复 ID、非法状态/来源、todo Change、终态改写与损坏 record
- **THEN** 两者 MUST 返回等价 stable code、blocked status、effects 与 nextActions
- **AND** 原 record 与 sibling owner records MUST 保持不变

#### Scenario: package source 与 runtime drift
- **WHEN** Skill source、contract、manifest description、binding、CLI schema registry 或 runtime 投射中的任一项缺失或过期
- **THEN** affected/package verification MUST 报告精确资产和 identity drift
- **AND** Buildr MUST NOT把结构 ready 冒充为行为已验证

#### Scenario: CLI 与 Buildr Web 行为漂移
- **WHEN** CLI 与 Buildr Web 对相同 open Task mutation 产生不同 record、validation code 或 state transition
- **THEN** affected/browser/package verification MUST 失败并指出发生漂移的 Application client
- **AND** 两个入口同时错误 MUST NOT掩盖 canonical contract 失败

## MODIFIED Requirements

### Requirement: 随包任务验证能力保持完整可组合
Buildr package MUST 原子交付 `buildr.task-verification/v3` contract、默认 `task-verification` provider、Project `buildr.project-verification/v2` reference/template、Workspace binding、CLI/Application runtime 与全部 supported runtime 投射输入。Package MUST 不再包含 v2 contract、v1 declaration reference、成熟度/三级 assurance/Candidate reuse guidance 或 Task Finish 的独立 verification summary authority。

#### Scenario: Package 声明 task-verification provider
- **WHEN** package static validation 读取随包能力声明
- **THEN** Workspace Skills manifest MUST 声明 installed、enabled 的 `task-verification` provider、`buildr.task-verification/v3` contract 与 binding
- **AND** package include mapping MUST 只投射 v3 contract 和 Project v2 reference/template

#### Scenario: Package 交付测试声明资料
- **WHEN** package static validation 检查 `task-verification` 完整目录
- **THEN** provider MUST 包含 v2 schema reference 和最小初始化模板
- **AND** 资料 MUST 只描述 capability identity、Project/Service scope、invocation、applicability、proves、requiredForDelivery 与按需边界

#### Scenario: Runtime 可发现验证入口
- **WHEN** 临时 Workspace 为任一 supported runtime 完成 sync 或 render
- **THEN** runtime inventory MUST 包含可发现的 v3 `task-verification` Skill
- **AND** description MUST 覆盖直接测试、正式 Task current Result、能力声明、实现完成验证与 coverage gap 意图

#### Scenario: Provider contract 组合验证
- **WHEN** Buildr 运行随包任务 Skills 契约验证
- **THEN** verifier MUST 覆盖 Result closed schema、atomic replacement、current/stale/unknown、transient execution separation、coverage gap、Buildr Web read-only 和 Finish shared consumer
- **AND** verifier MUST 确认 provider 不依赖固定 Git/Environment provider id，不拥有 Candidate、proceed/blocked 或 Task status

#### Scenario: 替换默认验证 provider
- **WHEN** Workspace 安装并绑定兼容的内部 `buildr.task-verification/v3` provider
- **THEN** consumers MUST 通过 binding 发现 provider 而不修改 consumer Skill
- **AND** 默认 provider 在不再被选中时 MUST 可安全卸载

### Requirement: Package 必须原子交付 Task Review authority
Buildr package MUST 原子交付 `buildr.task-review/v1` contract、默认 `task-review` Skill、Task Review Domain/Application/repository、CLI/JSON、Buildr Web Review API/Web assets、Task-scoped Planning Review route、workspace binding、runtime source mappings 与专项验证。任一 identity、version、provider、path、schema、binding 或 Application client 接线不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 安装或更新 workspace assets
- **WHEN** Buildr package 安装、更新或同步支持 Task Review 的 workspace
- **THEN** workspace Skills manifest MUST 登记 `buildr.task-review@1`、enabled/installed/optional 的 `task-review` provider 和 default binding
- **AND** runtime projection MUST 包含同一 contract/Skill identity，不得创建 planning-review/completion-review 两个 provider

#### Scenario: package/runtime parity
- **WHEN** Task Review 从 source checkout、package checkout 或 npm tarball 执行
- **THEN** 三者 MUST 产生等价的 persisted Result、operation JSON、CLI help、Buildr Web read model 和 target applicability

#### Scenario: Task Review 资产不完整
- **WHEN** contract、Skill、manifest/binding、Application/CLI、JSON registry、Buildr Web route 或 tests 任一缺失/漂移
- **THEN** package check/doctor MUST 报告 blocked，MUST 不把 capability 描述为 ready 或正式生效

### Requirement: Package residual gate 防止 Task Review 与 Retrospective 双 authority
Buildr package verification MUST 区分 Task Review、普通 Change review 与 Task Retrospective，并 MUST 拒绝任何第二个正式 Task Review writer/store、按类型拆分的 capability、Task Record/Environment Review 字段或绕过 Application 的 Task-scoped review route。

#### Scenario: Task Retrospective 保持独立
- **WHEN** package 同时包含`task-review`与`task-retrospective`
- **THEN** capability graph MUST显示不同contract identity、provider、store与consumer purpose
- **AND** 两者 MUST不互写 Result 或互为 lifecycle dependency

#### Scenario: Task-scoped route 仍使用普通 Change review
- **WHEN** Buildr Web 或 Agent action 在明确 Task context 下仍生成不记录 Planning Result 的旧通用 Change review prompt
- **THEN** residual gate/browser contract MUST 失败

#### Scenario: sibling records 受到写入影响
- **WHEN** Task Record、Environment、Task Review或Task Retrospective repository写入同一Workspace SQLite
- **THEN** 专项 fixture MUST证明每个writer只替换自己的精确current row并保留其他专业records

### Requirement: Package residual gate 必须防止 Task Verification 双 authority
Buildr package verification MUST 静态证明 Result persistence writer 只有 Task Verification Application 一个调用方，CLI 与 Buildr Web 不直接读写 YAML，Task Record/Environment/Review/Finish 不复制 Result fields，并 MUST 拒绝 source、manifest、docs、tests 或 generated package 中仍被默认流程引用的 v2/v1 lifecycle authority。

#### Scenario: 检查唯一 writer
- **WHEN** package verifier 扫描 Product source
- **THEN** `writeTaskVerificationResultPersistence` 的调用方 MUST 精确为 Task Verification Application
- **AND** CLI、Buildr Web 与 Finish MUST 只调用 Application methods

#### Scenario: 检查残留旧 authority
- **WHEN** package verifier 扫描受管 runtime assets、canonical docs 与公开 CLI
- **THEN** 不得存在 `buildr.task-verification/v2`、`project-verification/v1`、requiredAssurance、minimal/affected/candidate Result 层级或 direct verification summary consumer
- **AND** Product 内部测试 profile 中的 `candidate` 名称 MAY 保留，但 MUST 与 Task Verification declaration/Result authority 明确隔离

### Requirement: 产品验证必须覆盖已包含交付与post-Finish自举
Buildr package与runtime verification MUST覆盖Task Finish `already-contained` target disposition、正常post-Finish activation和retained Doctor blocked后的自举恢复，并证明普通用户Workspace、通用Task Finish Skill和Product executor不获得self-bootstrap专属依赖、路径分类或Doctor绕过分支。

#### Scenario: 验证 already-contained 快速完成
- **WHEN** integration fixture先交付carrier，再以保留全部carrier changed path after states的后续commit推进target
- **THEN** verifier MUST观察到零Task Contribution reapply、零新carrier commit、零Formal Verification execution和成功cleanup
- **AND** Result MUST包含ancestor/path-state containment evidence、原carrier ref和最新final remote ref

#### Scenario: 验证同路径变化仍fail closed
- **WHEN** 后续target commit改变任一carrier-owned path或无法读取target identity
- **THEN** verifier MUST观察到现有target-race或Delivery Adaptation路径
- **AND** MUST NOT观察到`already-contained`、自动冲突解决、Candidate rebuild或force push

#### Scenario: 验证自举只在Formal Finish后激活
- **WHEN** Buildr自举fixture的Formal Finish首轮成功且冻结Task Contribution命中自举影响路径
- **THEN** verifier MUST观察到Finish五阶段先完成，随后单一post-Finish activation按路径去重执行适用动作与最终Doctor
- **AND** Formal Finish Product executor MUST不执行package sync、development CLI install或development Buildr Web install

#### Scenario: 验证Doctor-blocked自举恢复
- **WHEN** 自举fixture在remote readback后让首次指定Agent Doctor失败，冻结贡献命中自举动作且append存在
- **THEN** verifier MUST观察到专属activation、同一run精确resume、最终指定Agent Doctor和之后的cleanup
- **AND** MUST观察到Candidate/generation、Formal Verification、Completion Review和handoff保持不变

#### Scenario: 验证普通 Workspace 不采用自举activation
- **WHEN** 未安装`buildr-self-bootstrap` Component的临时Workspace遇到相同指定Agent Doctor失败
- **THEN** Task Finish MUST保持blocked且不得进入cleanup
- **AND** runtime/package MUST不存在self-bootstrap slot、隐式dependency、路径分类或executor特判

### Requirement: self-bootstrap 候选验收必须证明 canonical store 未受污染
Buildr package/runtime verification MUST 覆盖 self-bootstrap candidate 对 canonical Structured Store 的 provenance rejection、独立 validation store migration、CLI/HTTP/internal driver writer routing 与候选 Buildr Web smoke。验证 MUST 证明拒绝路径零 mutation，并明确区分 candidate validation evidence 与 retained runtime activation evidence。

#### Scenario: package fixture 运行 candidate migration
- **WHEN** verifier 用 task worktree candidate runtime 分别指向 canonical Workspace 与 receipt-bound Task Validation Workspace
- **THEN** canonical target MUST 被拒绝并保持数据库 bytes/ledger 不变
- **AND** validation target MUST 能从空库连续应用 candidate migration 并运行受影响测试

#### Scenario: 候选集成后激活
- **WHEN** 最终候选完成 required verification 并进入 retained checkout
- **THEN** activation/Doctor MUST 由 retained source 运行并报告 retained runtime identity
- **AND** MUST NOT 把 candidate validation database 或其数据当作 canonical activation result

### Requirement: Package 必须验证创建前 dev 基线收敛工作流
Buildr package verification MUST 覆盖随包 `task-triage` 在新正式 Task 创建前条件消费 `buildr.git-operations/v1`、收敛统一 `dev` 基线并保持 Task Record 与 Environment authority 分离的行为，且 MUST 验证 source、package manifest、capability graph 与 supported Agent runtime 的一致性。

#### Scenario: 随包 Skill 与 capability graph 一致
- **WHEN** Buildr 验证 workspace package 中的 `task-triage`、Git Operations contract/provider 和 Skill manifest
- **THEN** `task-triage` MUST optional 声明 `buildr.git-operations@1` dependency，并只在新正式 Task create 分支提升为 required
- **AND** package/runtime projection MUST 保持 provider、binding、description 与 consumer routing evidence ready

#### Scenario: 成功路径先收敛再创建
- **WHEN** fixture repository 处于 clean `dev` 且配置 `origin/dev`，并分别覆盖 aligned、behind 与未 push 本地 commit 分叉状态
- **THEN** verification MUST 证明 task-triage 依次完成 fetch/rebase、适用 transition check，再调用 Task Record create
- **AND** 创建出的 Task Environment checkout MUST 基于收敛后的 local `dev` identity

#### Scenario: 失败路径不创建 Task
- **WHEN** fixture 覆盖 dirty、错误 branch/upstream、fetch failure、rebase conflict、abort recovery 与 abort failure
- **THEN** verification MUST 证明 Task Record create 未执行，并核对实际 effects、current facts 与 blocker
- **AND** MUST 证明没有自动 stash、merge、force push、策略切换或把部分成功伪装为零 effect

#### Scenario: 专业 authority 保持分离
- **WHEN** verifier检查 Task Record CLI/Application、Buildr Web mutation 和 Task Environment provider
- **THEN** 它们 MUST 保持不执行创建前 fetch/rebase，Task Record schema 与 Environment Receipt MUST 不新增该 Git 编排状态
- **AND** 创建前收敛 MUST 只存在于 Agent `task-triage` consumer 与 selected Git Operations provider 的组合行为

### Requirement: Package residual gate 必须退役持久化 Task Lifecycle projection
Buildr package、checkout runtime、npm tarball与Workspace投射 MUST交付相同的专业current schema、Task Overview reader与terminal completion reader，并 MUST从latest runtime composition、source、manifest、docs与tests删除Task Lifecycle projection repository/application/writers。历史连续migration `0006_create_task_lifecycle_current.sql` MAY保留为升级链事实，但latest schema与可执行runtime MUST不存在`task_lifecycle_current` table dependency或projection method。

#### Scenario: 静态扫描 current runtime
- **WHEN** package verifier扫描runtime composition、Application/repository imports、Finish executor与专业writers
- **THEN** `registerTaskLifecycleRepository`、`registerTaskLifecycleReadModelApplication`、`read/update/inspect/projectTaskLifecycle*`与Finish lifecycle refresh调用 MUST全部不存在
- **AND** Task、Environment、Development、Review、Verification与Finish writer MUST只更新所属专业authority

#### Scenario: 检查 migration package
- **WHEN** package verifier检查checkout、tarball与初始化Workspace的migration assets
- **THEN** 三种入口 MUST包含完全一致且连续的退役migration，并动态从assets解析latest version
- **AND** verifier MUST NOT通过固定版本号或删除历史`0006`来表达latest schema

#### Scenario: 验证 Overview 与专业 reader parity
- **WHEN** checkout、npm tarball或Buildr Web读取同一Task的Overview、研发、证据、环境与terminal状态
- **THEN** 各入口 MUST从专业current/Finish completion返回等价摘要与缺失/冲突diagnostic
- **AND** GET MUST不创建数据库、应用migration、观察外部事实或写回任一row

#### Scenario: 验证既有用户数据库升级
- **WHEN** package verification从fresh、各旧ledger起点、完整/部分lifecycle与冲突fixture升级到latest
- **THEN** 可安全数据 MUST保留，latest schema MUST没有`task_lifecycle_current`，terminal association不匹配 MUST完整rollback
- **AND** 旧runtime读取升级数据库 MUST返回`database-newer-than-runtime`

### Requirement: Package必须完整交付Environment Preparation Declaration能力
Buildr package MUST原子交付Preparation Declaration schema/reference/template、Plan Request/Plan/Receipt contracts、`task-environment`与相关consumer guidance、CLI/Application runtime、Doctor和Buildr Web read model。package manifest MUST列出所有新增Skill companion files，runtime投射 MUST不依赖Product checkout外未发布文件。

#### Scenario: package check验证新增资产
- **WHEN** Agent运行`buildr package check`
- **THEN** package check MUST验证全部Environment Preparation Declaration companion files存在且受manifest管理
- **AND** 安装后Workspace MUST能让Agent读取模板、选择Recipe并调用公开CLI

### Requirement: Package 必须原子交付 Parent coordination 能力
Buildr package MUST原子交付Domain/Application、Development Receipt major兼容、CLI/HTTP/public JSON、Buildr Web build、Skills/contracts/bindings与专项验证；任一schema、registry、source/package/runtime parity或Application接线不一致 MUST fail closed。

#### Scenario: package source parity
- **WHEN** package verifier检查Parent coordination资产
- **THEN** source、package target与runtime投射identity MUST一致
- **AND** CLI与Buildr Web MUST绑定同一Application

### Requirement: Package 原子交付 Task Retrospective v2
Buildr package MUST 原子交付 `buildr.task-retrospective/v2` contract、默认 provider、内部 driver、workspace binding、产品入口路由、Task Record v2 consumer binding 以及 Buildr Web 投影，并 MUST 不建立 lifecycle gate。

#### Scenario: Package 安装 Task Retrospective
- **WHEN** Buildr 初始化或同步 workspace
- **THEN** package MUST 安装 v2 contract 与完整 task-retrospective Skill
- **AND** default binding 与 Task Record consumer MUST 指向兼容 provider

#### Scenario: Package 校验 v2 边界
- **WHEN** Agent 运行 package check 或产品 affected verification
- **THEN** verifier MUST 检查 contract、provider、binding、driver、SQLite repositories、Buildr Web route、Result schema 与 Task 来源关系
- **AND** verifier MUST拒绝 history、自动采集、action item store、自动执行 Task 或 lifecycle gate

### Requirement: Package 必须原子交付 todo Task 与复盘承接能力
Buildr package MUST 原子交付升级后的 Task Record 与 Task Retrospective contracts/providers、SQLite migration、Application/repository、CLI/help/JSON、Buildr Web API/Web assets、capability bindings 和验证。任一版本、状态、来源关系、runtime projection 或客户端行为漂移时 package check 与 Doctor MUST fail closed。

#### Scenario: 初始化新 Workspace
- **WHEN** 新 package 初始化 Workspace 并创建带多个来源的 todo Task
- **THEN** CLI、Application 与 Buildr Web read model MUST 返回一致的 v2 record、todo status 和来源关系
- **AND** filesystem 与其他专业 current tables MUST 保持无新增

#### Scenario: 迁移既有 Workspace
- **WHEN** migration 遇到现有 active/completed/abandoned Task 与 retrospective rows
- **THEN** 所有既有 Task status、result、scope、references 与复盘内容 MUST 原样保留
- **AND** MUST NOT从缺失 artifacts、pending disposition 或文本内容推断 todo/来源关系

#### Scenario: package/runtime parity
- **WHEN** verifier 比较 source、npm package、workspace runtime 与 Buildr Web bundle
- **THEN** contract major、Skill routing、CLI action/filter、JSON schema、migration 和 Web labels MUST 一致
- **AND** 旧 runtime 读取更新后的 store MUST 按现有 migration version 边界 fail closed

## REMOVED Requirements

### Requirement: Package 必须原子交付 Task Manager 能力
Buildr package MUST 原子交付 Task Record Domain/Application/repository、`buildr.task-record/v2` capability contract、默认 `task-manager` provider、workspace binding、Skill source、CLI/help/runtime 接线、Local App Task routes/API/Web assets 和公开 JSON identity；任一 identity、path、version、binding 或 Application client 接线不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr 将包含 Task Manager 的 package 初始化或同步到 Workspace
- **THEN** workspace Skills manifest MUST 登记 `buildr.task-record@2` contract、`task-manager` Skill 与 default binding
- **AND** task-manager MUST 通过 `provides` 声明 `buildr.task-record@2`

#### Scenario: capability contract identity 不一致
- **WHEN** package manifest、workspace baseline manifest、contract frontmatter、provider provides 或 binding 对 capability id/version 的声明不一致
- **THEN** package check 和 doctor MUST 报告 identity integrity error
- **AND** runtime projection MUST NOT 猜测其中一份 identity 继续绑定

#### Scenario: 支持的 Agent runtime 投射 Task Manager
- **WHEN** retained Workspace 从已集成的产品 source 对支持的 Agent runtime 执行 sync/render
- **THEN** runtime MUST 收到完整 task-manager Skill、更新后的 task-triage 与受管 source/binding evidence
- **AND** doctor MUST 只在 contract、provider、consumer binding 和 runtime source 都可解析时报告 structurally ready

#### Scenario: bundled Local App 加载 Task 页面
- **WHEN** checkout、npm tarball 或平台 bundle 启动 Local App 并打开已登记 Workspace
- **THEN** server MUST 交付 Task route shell、Task Web feature 与对应 Workspace-scoped API
- **AND** Local App 与 CLI MUST 绑定同一 Task Record Application，不得各自携带独立 validator 或 filesystem writer

### Requirement: task-manager routing 与职责边界必须由 package verification 保护
Buildr package MUST 让 task-manager frontmatter、package manifest 与 workspace baseline manifest 使用完全一致的单句 description，并 MUST 通过静态与行为 fixture 防止它退化为全局 dispatcher、专业阶段执行器或复盘分析 owner。

#### Scenario: routing description 正向覆盖
- **WHEN** fixture 表达创建、查看、更新、激活、结束 todo/active Task Record 或按 Task ID 恢复顶层事实
- **THEN** task-manager description MUST 覆盖该意图
- **AND** Skill 正文 MUST 要求使用 selected `buildr.task-record/v2` provider 和实际 result evidence

#### Scenario: routing description 负向覆盖
- **WHEN** fixture 只表达普通修复/实现意图、纯讨论、只读探索、单次测试、临时服务或 Agent host task/thread 管理
- **THEN** package verification MUST 确认 task-manager 不自动创建 Task
- **AND** task-triage 或其他适用入口 MUST 不因新 Skill id 被遮蔽

#### Scenario: 专业职责渗入
- **WHEN** task-manager Skill 或 contract 包含 Environment 创建/记录、研发计划/实现、Review 判断、Verification 执行、Git policy、Finish 编排、Board 状态或复盘内容分析
- **THEN** package verification MUST 失败并报告越界内容
- **AND** provider MUST 只拥有 Task Record 六个 action、最小来源关系与结果证据

#### Scenario: Local App 前端复制产品逻辑
- **WHEN** Task Web feature 自行实现状态迁移、关系校验或直接接受 filesystem path
- **THEN** package/static verification MUST 失败并报告重复 authority
- **AND** Web feature MUST 只调用登记的 Workspace Task API 并展示 Application result

### Requirement: 产品验证必须覆盖 Task Manager package、CLI 与 Local App parity
Buildr package verification MUST 在 checkout、初始化 Workspace、同步 Workspace、隔离 runtime、Local App browser 与 npm tarball 场景覆盖 contract/Skill、todo/active 状态、来源关系、CLI registry/help、Local App route/API/assets、public JSON、filesystem effect 和失败分支，并 MUST 在任一入口行为漂移时失败。

#### Scenario: checkout 与 tarball 成功路径
- **WHEN** verifier 分别使用 checkout CLI 与 npm tarball CLI 对等执行 create/inspect/update/activate/complete/abandon 及来源关系 mutation
- **THEN** 两者 MUST 使用相同 command help、record/result schema 与状态语义
- **AND** todo 创建 MUST 证明除 SQLite owner rows 外无 filesystem 或专业副作用

#### Scenario: checkout 与 tarball 失败路径
- **WHEN** verifier 分别触发重复 ID、非法状态/来源、todo Change、终态改写与损坏 record
- **THEN** 两者 MUST 返回等价 stable code、blocked status、effects 与 nextActions
- **AND** 原 record 与 sibling owner records MUST 保持不变

#### Scenario: package source 与 runtime drift
- **WHEN** Skill source、contract、manifest description、binding、CLI schema registry 或 runtime 投射中的任一项缺失或过期
- **THEN** affected/package verification MUST 报告精确资产和 identity drift
- **AND** Buildr MUST NOT把结构 ready 冒充为行为已验证

#### Scenario: CLI 与 Local App 行为漂移
- **WHEN** CLI 与 Local App 对相同 open Task mutation 产生不同 record、validation code 或 state transition
- **THEN** affected/browser/package verification MUST 失败并指出发生漂移的 Application client
- **AND** 两个入口同时错误 MUST NOT掩盖 canonical contract 失败

### Requirement: Package 必须原子交付 Task Environment authority
Buildr package MUST原子交付`buildr.task-environment/v1` contract、Task Environment Application、Plan v1/Receipt v4 Domain、`task-environment` Skill、Plan/Environment公共CLI与JSON、v2/v3 compatibility reader、唯一SQLite writer、Task-scoped Change Resolver、Local App saved-current reader/API、Git provider contract、bindings、runtime mappings与迁移验证。任一identity、schema、CLI、source/package/runtime或Local App consumer不一致时package check与doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr初始化或同步包含Task Environment的Workspace
- **THEN** manifests MUST登记matching contract、provider和bindings
- **AND** MUST不交付Project dependency declaration parser或package-manager adapter registry

#### Scenario: capability graph 解析
- **WHEN** doctor解析task-triage、task-environment、task-worktree与task-finish
- **THEN** graph MUST显示正式workflow消费task-environment，Environment按需消费Git provider
- **AND** 旧capability、缺失provider、歧义或版本冲突 MUST产生精确诊断

#### Scenario: 公共 Task Environment CLI 完整登记
- **WHEN** verification检查help、CLI和public JSON registry
- **THEN** Plan record/inspect及Environment prepare/inspect/cleanup MUST全部出现并匹配各自schema
- **AND** internal resource/saved-current actions MUST不出现

#### Scenario: Local App只读保存事实
- **WHEN** checkout或npm tarball Local App读取Environment
- **THEN** GET MUST通过Application展示v4 Plan/Service/Step facts或legacy diagnostic
- **AND** MUST不执行Step、文件系统probe或Receipt写入

#### Scenario: 候选package在隔离Workspace证明fresh依赖
- **WHEN** candidate CLI作为外部controller为fresh fixture携带包含buildr/buildr-web步骤的Agent Plan执行prepare
- **THEN** 一次prepare MUST产生两个独立Service Step outputs并使`npm run build:web`使用buildr-web lockfile工具成功
- **AND** 同一机制 MUST能执行非npm fixture step而无需新增技术栈adapter

#### Scenario: 候选 package 在自身验证工作区测试
- **WHEN** Task worktree候选修改Plan、Receipt、CLI、Skill或Local App assets
- **THEN** candidate MAY只向receipt绑定验证工作区投射
- **AND** MUST阻止retained、peer Task与验证根外共享runtime target

#### Scenario: 集成后激活
- **WHEN** 候选进入retained checkout
- **THEN** Agent MUST从retained Product source执行适用sync/render/doctor
- **AND** 只有package/runtime identity一致且专项验证通过后才能报告正式生效

### Requirement: Buildr自举Component必须统一执行post-Finish activation
Buildr自举Workspace的`buildr-self-bootstrap` Component MUST通过单一专属Skill执行self-bootstrap activation。该Skill MUST只消费同一Finish run中冻结的Task Contribution paths，并 MUST按封闭路径分类去重组合package sync、development CLI install、development Local App install、默认CLI identity验证与最终Doctor/Finish resume；它 MUST NOT从HEAD、dirty tree、当前diff或时间重新猜测贡献。Formal Finish首轮Doctor通过时activation位于complete之后；首轮Doctor blocked时，只有前序delivery/remote evidence、matching resume token和适用动作全部成立，activation才可以先修复retained状态并恢复同一run。

#### Scenario: 普通源码或文档变化
- **WHEN** 冻结Task Contribution未命中package、CLI或Local App正式影响路径
- **THEN** self-bootstrap activation MUST返回`not-applicable`
- **AND** MUST不覆盖Doctor failure、不执行sync、CLI install、Local App install或默认CLI identity验证

#### Scenario: CLI影响路径
- **WHEN** complete或Doctor-blocked Finish Result的冻结Task Contribution命中Buildr CLI正式影响路径
- **THEN** self-bootstrap activation MUST使用Environment Receipt绑定的retained Node/CLI identity安装development CLI，并在所有适用安装动作后验证PATH实际命中的默认入口
- **AND** 通用Product executor本身 MUST观察到CLI installer调用次数为零

#### Scenario: Local App影响路径
- **WHEN** complete或Doctor-blocked Finish Result的冻结Task Contribution命中Buildr Local App正式影响路径
- **THEN** self-bootstrap activation MUST去重满足CLI依赖并安装development Local App，launcher identity MUST绑定delivered retained commit
- **AND** MUST不安装或覆盖稳定版Local App

#### Scenario: package workspace inputs
- **WHEN** 冻结Task Contribution命中package manifest或workspace package targets
- **THEN** self-bootstrap activation MUST执行retained sync，只提交受管sync delta，并通过普通push与远端回读完成收敛
- **AND** package sync MUST不与CLI或Local App分类重复执行相同动作

#### Scenario: 多种影响同时命中
- **WHEN** 同一冻结Task Contribution同时命中package、CLI和Local App路径
- **THEN** 单一self-bootstrap activation MUST分别至多执行一次sync、CLI install、Local App install、默认CLI identity验证和最终Doctor或Finish resume
- **AND** MUST不启动第二个orchestrator或持久化新的workflow state

#### Scenario: 默认CLI identity通过
- **WHEN** 任一self-bootstrap动作适用且所有安装动作已经完成
- **THEN** runner MUST按PATH顺序解析实际命中的`buildr`，证明其入口链绑定本次delivered retained checkout的`scripts/run-development-cli`与`bin/buildr.mjs`
- **AND** runner MUST通过该入口执行`version --json`并核对retained `package.json`中的package/version

#### Scenario: 默认CLI identity失败
- **WHEN** PATH无`buildr`、被其他命令抢占、symlink指向旧checkout、launcher或CLI entry链路不匹配、版本不一致或命令启动失败
- **THEN** self-bootstrap activation MUST fail closed并停止最终Doctor或Finish resume
- **AND** Result MUST保留实际PATH命中、预期与观测入口及精确恢复事实

#### Scenario: Doctor-blocked run恢复
- **WHEN** 同一run的前序交付完整、唯一失败为retained Doctor、存在matching resume token且至少一个self-bootstrap动作适用
- **THEN** 专属Skill MUST在动作和默认CLI identity验证成功后，通过已验证默认入口用该token恢复同一Finish run，由resume中的指定Agent Doctor形成最终结论
- **AND** MUST不额外运行第二个最终Doctor、不创建新orchestrator或持久化新的workflow state

#### Scenario: Formal Finish已经complete
- **WHEN** 首轮指定Agent Doctor、cleanup与Formal Finish已经成功且至少一个self-bootstrap动作适用
- **THEN** 专属Skill MUST在post-Finish动作和默认CLI identity验证后，通过已验证默认入口显式运行一次最终指定Agent Doctor
- **AND** 任一动作即使被多条路径命中也 MUST至多执行一次

### Requirement: 产品验证必须覆盖 Environment authority 与清理
Buildr product verification MUST 覆盖 Task Record gate、共享执行根、单/多 repo Git provider、Runtime/CLI/依赖准备、runtime projection、Task-scoped Change 解析、Local App Environment inspect、资源登记、串行恢复、Finish cleanup handoff与明确放弃，并 MUST 证明所有正式 consumer 只读写 Workspace SQLite Environment current authority。

#### Scenario: checkout 与 npm package 正常路径
- **WHEN** verifier 分别从 checkout 和 npm tarball 初始化临时 Workspace 并执行正式 Task 环境流程
- **THEN** 两者 MUST 产生等价的 Task Environment contract/result、SQLite current row、provider evidence 与 ready/cleanup 语义
- **AND** 只允许 machine path、时间、进程和下载缓存等真实本机事实不同

#### Scenario: Buildr 自举依赖准备
- **WHEN** 干净 task checkout 没有 `node_modules` 且候选 CLI probe 失败
- **THEN** retained stable controller MUST 使用 Workspace Node/npm 与 checkout 自己的 lockfile 完成 `npm ci` 后重新 probe
- **AND** verifier MUST 证明 retained/peer `node_modules` 未被复用、链接或修改

#### Scenario: 动态资源登记失败
- **WHEN** preview/dev server 已启动但 Environment writer 拒绝登记
- **THEN** creator MUST 停止刚创建的 owned process/resource 并返回失败
- **AND** current row、其他 previews、默认 Local App 与其他任务 MUST 保持不受影响

#### Scenario: Task-scoped Change 与 Local App Environment
- **WHEN** Change 只存在于 matching Task Environment Project root，且用户打开该 Task 详情
- **THEN** Task Record reference 与 task-scoped Change detail MUST 返回 candidate provenance，环境页签 MUST 通过 Application `inspect` 返回当前机器的有界 probe
- **AND** 全局 Change list MUST 保持 retained-only，Web/HTTP MUST 不直接读取 Receipt store 或接受任意 filesystem path

#### Scenario: 正常 Finish 与放弃 cleanup
- **WHEN** fixture 分别提供已交付 normal handoff、明确 abandon authorization 和 ownership 不明 shared root
- **THEN** Environment MUST 分别完成安全清理、清理可证明的 Task-owned dirty 资源、对不明 shared content 返回 blocked/retained
- **AND** Task Finish MUST 不直接调用 worktree cleanup、重复交付或写第二份 cleanup 结论

#### Scenario: 防止文件 authority 回退
- **WHEN** package/static/runtime verification 发现旧 environment writer、文件 importer、`worktree context/adopt` guidance、adoption receipt、environment-shaped worktree JSON/help 或 consumer direct edge 任一仍可达
- **THEN** verification MUST 失败并报告具体冲突入口
- **AND** legacy identity 只 MAY 出现在 OpenSpec archive/history，Buildr runtime、sync 与 package tests MUST NOT保留迁移 reader
