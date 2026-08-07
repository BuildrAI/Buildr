# task-finish-execution Specification

## Purpose

定义 Task Finish 如何把一个逻辑任务的收尾持久化为可检查、可恢复、可精确失效且支持并发资源协调的独立执行 run。

## Requirements

### Requirement: Task Finish 必须是固定五阶段执行器
Buildr MUST继续以`preflight → prepare → verify → deliver → cleanup`五个固定阶段执行当前P0.5 Task Finish adapter，MUST NOT把普通动作暴露为需要Agent completion的可扩展step、action registry或通用provider DAG。`verify`阶段在P0.5只核验Development handoff与carrier内容等价，MUST NOT执行formal Verification或访问Verification Result。阶段状态MUST只表达`pending|running|passed|blocked|failed|not-applicable`。

#### Scenario: 正常候选进入收尾
- **WHEN** 调用方对Development Application提供的current finish handoff执行`buildr task finish run`
- **THEN** 产品 MUST按五阶段顺序连续执行到完成或真实停止边界
- **AND** 正常路径 MUST NOT请求调用方提交Candidate、step outcome、attempt、effect、evidence、fingerprint、execution plan或recovery manifest

#### Scenario: 固定阶段内包含多个机械动作
- **WHEN** prepare或deliver需要执行多个确定性carrier/delivery动作
- **THEN** 产品 MUST将它们记录为阶段operations/observations
- **AND** MUST NOT因新增一个机械动作而扩展公共workflow step数或取得Development authority

### Requirement: Preflight 必须一次聚合廉价门禁
`preflight` MUST在任何delivery mutation前通过Task Development Application取得current handoff，并一次聚合Environment executable、handoff applicability、delivery target、retained root、carrier prerequisites与cleanup ownership findings。Finish MUST NOT在preflight解析Change/tasks/knowledge/OpenSpec、verification policy、Review或Verification stores；这些facts必须已由Development handoff闭合。Preflight有error时 MUST零delivery mutation。

#### Scenario: 候选同时存在多个廉价问题
- **WHEN** Development handoff stale、receipt-bound CLI不可执行且目标ref不可用
- **THEN** preflight MUST在同一结果中按check identity返回全部可同时观察的问题
- **AND** prepare、verify、deliver与cleanup MUST保持未执行

#### Scenario: Receipt 只证明路径身份
- **WHEN** Task Development Application报告handoff missing、blocked或stale
- **THEN** Finish MUST返回`nextWorkflow: task-development`
- **AND** MUST NOT从Task Record、Git、Change、Review或Verification自行重建handoff

### Requirement: Task Finish 必须只接受 finish-ready candidate

进入Task Finish的Candidate MUST由Task Development Application生成并通过current handoff交接；该handoff MUST已闭合Content Target、Task context、verification policy、Planning/Verification/Completion gates与proceed decision。Task Finish MUST NOT执行额外Review、formal Verification、risk decision、Candidate generation或Candidate applicability判断。Development Application报告的内容、context、policy、gate或handoff漂移 MUST退出当前Finish并回到Development；Finish自己的Git conflict只表示机械应用失败或需要语义判断，MUST进入隔离Delivery Adaptation而不得宣称Candidate stale。

#### Scenario: Preflight 发现产品缺陷

- **WHEN** Development Application报告Candidate/handoff不再current
- **THEN** run MUST标记terminal `failed`并返回`nextWorkflow: task-development`
- **AND** MUST NOT在Finish中编辑内容、修改decision或补写专业Result

#### Scenario: carrier等价核验失败

- **WHEN** current handoff对应的Task Contribution不能机械应用到最新Delivery Baseline
- **THEN** run MUST blocked并返回`delivery-adaptation-required`或`semantic-review-required`
- **AND** MUST NOT归类为`upstream-candidate-defect`、写Development Receipt或声明任何Development fact stale

#### Scenario: 正式保证发现测试失败

- **WHEN** Development handoff缺少current Verification gate、Result为stale/incomplete，或未形成允许推进的Development decision
- **THEN** Finish MUST在preflight返回`nextWorkflow: task-development`
- **AND** MUST NOT在Finish内执行formal Verification、读取Result store或接受风险

### Requirement: Deliver 必须只交付冻结候选
`deliver` MUST在短target lease/fencing边界内重新核对Delivery Carrier绑定的expected target ref，只允许已通过Development handoff current与Task Contribution equivalence的carrier fast-forward、普通push、retained Workspace convergence与受影响入口安装。Product adapter MUST在创建Git-backed run时从retained checkout当前符号分支解析默认target branch；显式target branch MUST与该当前分支一致。Task Environment checkout `startPoint` MUST只作为环境来源证据，不得直接充当交付分支identity。Product adapter MUST为每个Git-backed Finish run绑定retained checkout中真实配置的delivery remote；当Environment repository因`source.type: workspace`没有声明remote时，MUST从target branch upstream或唯一配置的remote确定性解析，无法解析或存在歧义时 MUST在创建run和delivery mutation前fail closed。普通push成功后 MUST重新读取远端target ref；只有真实回读值等于carrier ref时才能记录`remoteAfterRef`、报告`delivered`并进入cleanup。Force push、merge commit、远端任务分支push/delete、丢弃改动、原Task worktree rebase和语义冲突resolution MUST保持未授权。

#### Scenario: Workspace startPoint 不是交付分支
- **WHEN** Task Environment repository以`startPoint: HEAD`或其他checkout表达式记录候选来源，retained checkout当前符号分支为`dev`
- **THEN** 新Finish run MUST冻结`dev`为target branch，而不是冻结Environment startPoint
- **AND** remote解析、preflight、push与回读 MUST使用该真实target branch

#### Scenario: 显式 target branch 与 retained 不一致
- **WHEN** 调用方显式选择的target branch不等于retained checkout当前符号分支，或retained checkout处于detached HEAD
- **THEN** Product adapter MUST在创建run和任何carrier/delivery mutation前fail closed
- **AND** MUST NOT切换retained branch、猜测其他branch或改写旧run identity

#### Scenario: 目标 ref 未漂移
- **WHEN** observed target ref等于Delivery Carrier的Delivery Baseline ref且carrier仍equivalent
- **THEN** deliver MUST完成明确ref transition、普通push与retained convergence
- **AND** result MUST记录before/carrier/after remote ref、Task Contribution与Candidate identity

#### Scenario: Workspace source 复用根 Git remote
- **WHEN** Task scope使用`source.type: workspace`、Environment repository没有remote字段，但retained target branch存在可验证的upstream remote或repository只有一个已配置remote
- **THEN** Product adapter MUST在run identity中绑定该真实remote并按正常远端交付路径执行
- **AND** MUST NOT退化为仅推进本地target branch

#### Scenario: Delivery remote 无法确定
- **WHEN** retained repository没有可用remote，或多个remote无法通过显式参数、Environment evidence或target branch upstream消歧
- **THEN** Product adapter MUST在创建run和任何carrier/delivery mutation前fail closed
- **AND** MUST NOT报告`remoteAfterRef`、远端交付完成或cleanup eligibility

#### Scenario: Push 后远端回读成功
- **WHEN** 普通push返回成功且push后的远端target ref回读值等于carrier ref
- **THEN** deliver MUST以该真实回读值记录`remoteAfterRef`并继续retained convergence
- **AND** `delivered` MUST只在后续适用动作也成功后成立

#### Scenario: Push 后远端回读失败或不一致
- **WHEN** 普通push后无法读取远端target ref，或真实回读值不等于carrier ref
- **THEN** deliver MUST停止且不得形成远端完成证据或进入cleanup
- **AND** 暂时无法读取 MAY保留同一carrier的deliver恢复点；回读不一致且无法证明Task Contribution仍等价 MUST返回Task Development

#### Scenario: 目标 ref 外部前进
- **WHEN** push前observed target ref不再等于Delivery Carrier的Delivery Baseline ref
- **THEN** deliver MUST释放lease并返回带产品生成精确token的resumable `task-finish.target-race`
- **AND** recovery MUST只重做隔离carrier的`prepare → verify → deliver → cleanup`，不得重建Candidate、重跑formal Verification、force push或自行解决内容冲突

#### Scenario: Retained 入口受影响
- **WHEN** Development Candidate改变runtime、默认CLI或Local App的正式影响路径
- **THEN** deliver MUST使用receipt-bound retained root、CLI与Node identity执行相应doctor/sync/install
- **AND** 未受影响入口 MUST记录not-applicable reason而不执行安装

### Requirement: Resume 必须由产品根据真实状态生成

Task Finish MUST根据current run、Development handoff、Task Contribution、Delivery Baseline、carrier observations、target ref与retained/cleanup真实状态生成最早可恢复边界和`resumeToken`。Content Target与handoff仍current的target lease、target race、Delivery Adaptation、retained或cleanup阻塞 MAY在同一run恢复。调用方 MUST NOT提供recovery manifest、Candidate、step fingerprint、execution plan、claimed semantic equivalence或冲突解决结果boolean。

#### Scenario: 目标 ref 前进后的候选恢复

- **WHEN** run在deliver发现`task-finish.target-race`，且调用方提供current product-generated matching resume token
- **THEN** 产品 MUST使旧prepare/verify/deliver/cleanup outputs失效，从prepare读取最新Delivery Baseline并重建隔离carrier
- **AND** Candidate identity/generation、Verification Result、Completion Review、decision与handoff MUST保持不变且`formalVerificationExecutions`保持0

#### Scenario: target race恢复发现冲突或贡献漂移

- **WHEN** 新Delivery Baseline无法机械应用原Task Contribution，但Development handoff仍current
- **THEN** 当前run MUST进入可恢复的`delivery-adaptation-required`而不是terminal Candidate defect
- **AND** MUST保留或重建run-owned carrier，不自动解决冲突或返回Development rebuild

#### Scenario: Delivery Adaptation恢复

- **WHEN** Agent只在匹配run-owned carrier完成适配并持matching resume token恢复
- **THEN** 产品 MUST重新核验ownership、baseline ancestry、source/handoff current、carrier cleanliness与policy-required compatibility checks
- **AND** resume动作本身 MUST NOT充当semantic equivalence evidence

#### Scenario: 暂态条件解除

- **WHEN** run因target lease、retained install或cleanup暂态失败，且再次观察证明handoff与适用carrier未变、条件已解除
- **THEN** matching resume token MAY从最早blocked phase继续
- **AND** 已通过的prepare/verify MUST仅在Development Application仍报告current时复用

#### Scenario: 恢复状态无法证明

- **WHEN** ownership、baseline、source contribution、handoff、cleanliness或compatibility checks任一无法证明
- **THEN** 产品 MUST fail closed保持blocked并生成具体diagnostic
- **AND** MUST NOT push、cleanup原Task Environment或要求Agent手写recovery JSON

### Requirement: Cleanup 必须由 retained checkout 完成真实收尾
`cleanup` MUST由retained finalizer先写durable Finish completion/delivery facts，再通过canonical retained Workspace的可信、source-clean Environment Manager向selected `buildr.task-environment/v1` provider提交每个工作范围的delivery identity与cleanup eligibility。对隔离re-application carrier，handoff MUST包含可独立复算的Task source snapshot、原Task Contribution、Delivery Baseline、carrier与remote target identities；Task Environment MUST独占资源停止、provider cleanup、贡献交付复核、共享根解除占用和Environment cleanup result。Task Finish MUST只记录handoff/result summary并清理自己精确拥有的隔离carrier，MUST NOT比较或更新Receipt controller content fingerprint，也 MUST NOT直接扫描Environment资源、删除Task branch/checkout或写第二份环境结论。

#### Scenario: 资源可安全清理
- **WHEN** frozen Candidate已通过等价Task Contribution carrier交付、Finish completion durable，且Environment复核全部Task-owned资源/provider evidence可安全处置
- **THEN** Task Environment MUST停止动态资源、调用适用provider cleanup并返回removed/retained evidence
- **AND** Finish cleanup stage MUST记录Environment result reference/status，再删除精确run-owned隔离carrier并完成run

#### Scenario: 原Task branch不是carrier祖先但贡献已等价交付
- **WHEN** 原Task worktree未被改写，因隔离re-application而不是remote target的Git祖先，但Environment能独立复算source snapshot与target carrier上的Task Contribution identity相等
- **THEN** Git provider MUST接受该bounded contribution proof作为正常交付integrated evidence并清理原Task worktree/branch
- **AND** MUST NOT为满足ancestor检查而改写原Task branch、Candidate或target history

#### Scenario: retained manager 在交付后已升级
- **WHEN** Finish completion/delivery facts与Task-owned resource/provider evidence匹配，当前retained Environment Manager clean/可信，但content identity与Receipt创建指纹不同
- **THEN** cleanup MUST继续消费既有delivery handoff并按当前资源/provider facts执行
- **AND** Finish prepare/recovery input identity MUST NOT纳入Receipt controller content fingerprint
- **AND** MUST NOT自动改写controller identity、创建generation transition或重跑prepare/verify/deliver

#### Scenario: Task-owned 资源仍在运行或无法证明
- **WHEN** Environment cleanup观察到matching preview/runtime未停止、provider identity不匹配、contribution proof无法复算、shared root ownership不明或其他Task仍占用资源
- **THEN** Environment MUST返回resumable `blocked`并保留Task与carrier现场
- **AND** Finish MUST只保留cleanup resume point，不得重跑prepare、verify、deliver或自行终止/删除Environment资源

#### Scenario: Finish 尝试直接调用 Git provider
- **WHEN** Finish cleanup path绕过Task Environment请求Task worktree cleanup、删除Task branch/checkout或解释provider evidence
- **THEN** product verification MUST fail并指出越过Environment authority的调用路径
- **AND** Git provider MUST只接受Task Environment提供的matching cleanup handoff

#### Scenario: Environment 已清理但 Finish 尚未完成
- **WHEN** Environment Receipt已记录matching complete cleanup，而Finish run因隔离carrier cleanup或result持久化等后续暂态条件中断
- **THEN** resume MUST复用同一Environment result，不得再次停止资源或调用provider cleanup
- **AND** Finish MUST只完成自己尚未完成的carrier/result/completion动作

### Requirement: Current run 与结果必须直接表达阶段、失败和效率
Canonical Task Finish MUST在Workspace SQLite唯一current store中写入`buildr.task-finish-run/v2`并返回compact `buildr.task-finish-result/v2`，MUST NOT新建第二个Finish Receipt authority。current run MUST包含Task、Development handoff、Candidate/Content Target、carrier/target identity、五阶段状态与timing、current primary failure、bounded diagnostic、resume/development workflow、固定为0的formal verification execution count、product command observations、CLI invocation count、Agent provider completion count、manual recovery count、wall-clock coverage和cleanup状态。完成后SQLite MUST只保留绑定同一事实的compact terminal Result，并删除current run；Full detail MUST通过有界digest绑定的transient引用提供，MUST不投射Finish-owned change kind、Candidate generation或verification authority。

#### Scenario: 正常路径完成
- **WHEN** 五阶段全部成功或not-applicable，且Finish-owned transient cleanup完成
- **THEN** terminal result MUST报告`status: complete`、durable completion和全部效率字段，且current run MUST不存在
- **AND** MUST明确`formalVerificationExecutions: 0`、`agentProviderCompletions: 0`与`manualRecoveryManifests: 0`

#### Scenario: 中途失败
- **WHEN** 任一阶段blocked或failed
- **THEN** SQLite current run与compact result MUST直接包含phase、operation/check、code/status/exit、diagnostic identity和唯一next workflow/action
- **AND** 已解决的历史失败 MUST NOT继续作为current primary failure

### Requirement: 客户端升级必须直接替换 Task Finish 实现
Buildr Client升级后 MUST直接以Workspace SQLite-backed五阶段执行器替换旧Task Finish实现，并 MUST只使用SQLite run、completion与target lease authority。客户端 MUST NOT继续以`.buildr/task-finish/runs`、`completed`或文件lease作为current authority，也 MUST NOT创建并行协议目录、长期双写、permanent legacy reader、cutover adapter或第二套executor。旧`.buildr/task-finish`目录 MUST在SQLite-only runtime启用前直接清理，旧数据 MUST不被迁移或恢复。

#### Scenario: 升级后存在旧的未完成 run shape
- **WHEN** SQLite-only runtime启用前发现旧File Store中存在未完成、blocked、failed、未知schema或无法复核的run
- **THEN** 受控升级步骤 MUST 直接删除旧目录；新Finish MUST依据SQLite current上游与环境事实建立新run
- **AND** 客户端 MUST NOT读取、导入、advance、finalize、转换或继续该旧run

#### Scenario: 升级后存在可验证的已完成交付
- **WHEN** SQLite-only runtime启用前发现旧File Store中存在看似已完成的run/completion
- **THEN** 受控升级步骤 MUST 直接删除旧目录，不得配对、导入或恢复其completion
- **AND** 新Result MUST只由SQLite-backed Finish重新产生

#### Scenario: legacy 路径不安全或清理失败
- **WHEN** 受控清理发现旧目录存在symlink、path escape或无法删除的文件
- **THEN** Buildr MUST fail closed，不得把旧文件作为Finish输入
- **AND** 新writer MUST NOT回退为旧协议写入或形成双写

#### Scenario: 用户不升级客户端
- **WHEN** 用户继续运行旧 Buildr Client
- **THEN** 旧客户端及其旧协议行为不受新客户端代码影响
- **AND** 当前客户端代码库 MUST NOT 为此维护双协议、兼容或状态迁移分支

### Requirement: 正常路径必须满足硬自动化验收
Buildr Product MUST以真实Task Environment journey验收P0.5 Finish adapter正常路径：一次用户授权后只启动一次canonical Task Finish CLI，Agent不完成provider checkpoint、不手写恢复、不执行formal Verification，五阶段连续到completion。Benchmark MUST分别记录preflight、prepare、verify-equivalence、deliver、cleanup、产品执行、外部等待和端到端wall-clock，MUST NOT推断token数量。

#### Scenario: 无冲突普通任务收尾
- **WHEN** current Development handoff、目标分支和运行环境均满足正常条件
- **THEN** journey MUST断言`canonicalCliInvocations: 1`、`agentProviderCompletions: 0`、`manualRecoveryManifests: 0`、`formalVerificationExecutions: 0`
- **AND** MUST证明carrier commit、equivalence、push、retained action与cleanup真实发生，而不是只检查JSON字段形状

#### Scenario: 产品缺陷被发现
- **WHEN** journey在handoff后注入source content变化
- **THEN** Task Finish MUST一次返回具体`task-development` handoff
- **AND** benchmark MUST在该failure结束，不把修复或re-verification计入Finish wall-clock

### Requirement: Task Finish 必须冻结并核验 Workspace Node identity
Task Finish MUST在preflight读取Workspace Node identity，并在prepare、verify-equivalence、deliver与resume前重新核验。Finish的CLI、carrier Git动作、retained sync/install和子进程 MUST使用该identity对应的受管runtime；Node identity不属于Development Candidate identity，也不得用于复用Verification evidence。

#### Scenario: Finish 复用匹配证据
- **WHEN** Environment/retained execution要求的Node identity在Finish各阶段保持一致
- **THEN** Finish MAY继续机械delivery并在结果中披露Node identity

#### Scenario: Candidate 与 Finish Node 不一致
- **WHEN** 当前受管Node identity与Environment execution requirement不一致或证据缺失
- **THEN** Finish MUST停止delivery并返回精确environment/runtime诊断
- **AND** MUST NOT通过重跑Verification或修改Candidate吸收差异

#### Scenario: Finish 运行中 Node identity 漂移
- **WHEN** 受管runtime identity在preflight、prepare、verify、deliver或resume之间改变
- **THEN** Finish MUST fail closed且不得继续push或cleanup

### Requirement: Task Finish 必须支持无 Change 的 code-only 候选
Task Finish MUST以receipt-bound Task identity与Development handoff作为所有run的主身份，并 MUST允许Task Record包含0..N Change references。Change context已由Development handoff闭合且对Finish保持opaque；Finish MUST NOT要求调用方提供单一Project/Change、派生Candidate kind，也不得为无Change候选创建、推断或选择虚假Change。

#### Scenario: Code-only task environment 进入收尾
- **WHEN** 一个无Change正式Task已由Development形成current handoff
- **THEN** `task finish run` MUST创建只绑定Task/handoff/Candidate/Content Target的run
- **AND** MUST只执行carrier、equivalence、目标分支交付、retained convergence与task-owned cleanup

#### Scenario: Change 候选保持兼容
- **WHEN** Development handoff的Task context包含多个Change references
- **THEN** Finish MUST把Change context作为opaque handoff fact消费
- **AND** MUST NOT选择单一`--project/--change`或执行任何Change convergence

#### Scenario: 非 task environment 调用产品执行器
- **WHEN** 调用方直接从retained canonical Workspace启动产品`task finish run`
- **THEN** 产品执行器 MUST继续以稳定`not_task_environment`诊断拒绝
- **AND** MUST NOT因code-only支持而在dirty retained tree中stage、commit或移动用户改动

### Requirement: Finish CLI 不得接受旧 Verification authority 输入
`buildr task finish run` MUST NOT接受`--required-assurance`、`--verification-summary`、declaration digest、Result bytes、applicability、Candidate identity/generation、`--project`或`--change` authority输入。Finish MUST只从Task ID解析matching Environment与Task Development handoff。

#### Scenario: 调用方提供旧 assurance 或 summary
- **WHEN** 调用方传入旧Verification/Candidate/Project/Change authority参数
- **THEN** CLI MUST以unknown argument拒绝
- **AND** MUST NOT创建或修改Finish run、Development Receipt、transient execution或专业Result

### Requirement: Prepare 必须只准备内容等价Delivery Carrier

`prepare` MUST在产品拥有的隔离位置，以最新Delivery Baseline机械形成承载current Development Candidate之Task Contribution的可交付ref。它 MAY使用临时Git index、source snapshot tree、binary patch、detached worktree与carrier commit，但 MUST NOT提交、rebase或改写原Task worktree/index/branch，MUST NOT执行OpenSpec convergence/archive、runtime内容sync、生成资产收敛、语义冲突resolution、Candidate freeze或generation。Clean apply必须记录`deterministic-reuse`；机械失败必须保留run-owned baseline carrier并返回Delivery Adaptation facts。

#### Scenario: 未提交内容形成carrier commit

- **WHEN** exact Candidate source可在最新Delivery Baseline无冲突应用并确定性核验原Task Contribution identity
- **THEN** prepare MUST只在隔离carrier中commit并记录Task Contribution、Delivery Baseline、changed paths、mode/blob与carrier ref
- **AND** reuse mode MUST为`deterministic-reuse`，原Task worktree、Candidate/generation与专业Result保持不变

#### Scenario: 最新基线已前进且贡献等价

- **WHEN** 最新Delivery Baseline不同于原任务基线，但Git应用无冲突且应用后的canonical delta identity等于原Task Contribution
- **THEN** prepare MUST进入verify并复用原handoff
- **AND** reuse mode MUST为`deterministic-reuse`且不得执行formal Verification或Completion Review

#### Scenario: Git apply conflict需要Delivery Adaptation

- **WHEN** 同路径Delivery Baseline变化导致Git apply conflict或需要语义判断
- **THEN** prepare MUST保留匹配run-owned baseline carrier，blocked返回`delivery-adaptation-required`/`semantic-review-required`及exact resume token
- **AND** MUST不自动解决冲突、不cleanup原Task Environment、不修改Development Receipt或原Task worktree

#### Scenario: prepare需要改变source bytes

- **WHEN** Development Application报告Content Target/handoff stale或冻结Task Contribution source漂移
- **THEN** prepare MUST停止并返回Task Development rebuild
- **AND** MUST不把Delivery Adaptation当成新Task Contribution或第二Candidate

### Requirement: Verify 必须只证明handoff与carrier等价

`verify` MUST再次通过Task Development Application检查current handoff与Candidate applicability，并核验隔离carrier ownership、Delivery Baseline、source Task Contribution、carrier cleanliness与适用compatibility checks。Clean apply路径 MUST核验canonical delta identity并记录`deterministic-reuse`；适配路径 MUST记录`agent-reviewed-delivery-adaptation`与确定性Git/check facts，不得声称Buildr已证明语义等价。该阶段 MUST NOT写Task Verification Result、生成Candidate或执行Completion Review，`formalVerificationExecutions` MUST始终为0。

#### Scenario: handoff与carrier仍current

- **WHEN** carrier上的应用delta与原Task Contribution identity完全等价且Development handoff current
- **THEN** verify MUST记录`deterministic-reuse`与handoff/candidate/contribution/baseline/carrier identities
- **AND** MUST不启动formal Verification或Completion Review

#### Scenario: Verification Result在Finish期间变化

- **WHEN** owner Result或declaration变化导致Development handoff失效
- **THEN** verify MUST按Development Application read model停止并返回Task Development
- **AND** Finish MUST不直接检查、修复、覆盖或重新执行Verification

#### Scenario: Agent-reviewed Delivery Adaptation

- **WHEN** Agent完成隔离carrier适配，carrier ownership/baseline/source/handoff仍current且policy-required compatibility checks通过
- **THEN** verify MUST记录`agent-reviewed-delivery-adaptation`、changed paths、mode/blob、tree/head、cleanliness与check evidence
- **AND** MUST NOT把结果描述为Buildr确定性证明语义等价

#### Scenario: carrier贡献不等价

- **WHEN** ownership/baseline漂移、source/handoff stale、carrier dirty或compatibility checks失败
- **THEN** verify MUST fail closed且不得进入deliver
- **AND** MUST不push、不cleanup原Task Environment或伪造reuse evidence

### Requirement: Code-only run 必须完全省略Change authority
Task Finish MUST对无Changehandoff完全省略Change tasks、knowledge impact、OpenSpec plan/check/convergence/archive operations，MUST NOT新增`candidateKind`或`changeContext`字段重新拥有分类。结果与completion evidence MUST包含Task、Candidate、handoff、Content Target、carrier与Workspace Node identity。

#### Scenario: Code-only preflight
- **WHEN** preflight处理code-only handoff
- **THEN** Environment/CLI、Development handoff、Git/target与retained readiness MUST正常检查
- **AND** MUST不执行或伪造Change/OpenSpec checks

#### Scenario: Code-only prepare
- **WHEN** code-only run进入prepare
- **THEN** prepare MUST只形成内容等价carrier并调用Development equivalence
- **AND** command observations MUST证明没有调用OpenSpec executable

#### Scenario: Code-only completion
- **WHEN** code-only run完成deliver与cleanup
- **THEN** durable completion MUST记录task、handoff/Candidate/Content Target identity、carrier ref和目标分支
- **AND** MUST不创建Change context或not-applicable占位来重新解释Development语义

### Requirement: Git Finish 必须区分任务贡献与交付基线

Git-backed Task Finish MUST把任务贡献（Task Contribution）定义为原任务基线tree到冻结Task source snapshot tree的canonical Git delta，把交付基线（Delivery Baseline）定义为prepare时读取的最新远端target commit/tree。Delivery Baseline变化或机械应用冲突 MUST NOT自动改变Development Candidate、generation、Verification Result、Completion Review或handoff。Finish只拥有交付载体可行性与确定性Git/check事实；Candidate applicability只由Task Development拥有。

#### Scenario: 目标分支前进但任务贡献未变

- **WHEN** Candidate freeze后远端target前进，Development handoff current，且原Task Contribution可无冲突应用并得到相同delta identity
- **THEN** Finish MUST以`deterministic-reuse`复用原Candidate/gates/handoff并成功交付cleanup
- **AND** generation不增加且`formalVerificationExecutions`为0

#### Scenario: 同路径变化导致冲突但source未变

- **WHEN** Git apply conflict但Development只读inspect证明原Task source、context、policy与gates未变
- **THEN** Finish MUST返回Delivery Adaptation事实而非Candidate stale
- **AND** Agent可在隔离carrier适配并通过compatibility checks后恢复同一run交付，结果为`agent-reviewed-delivery-adaptation`

#### Scenario: 机械事实不能证明语义安全

- **WHEN** Buildr只观察到路径不重叠、clean apply、Git delta或caller resume
- **THEN** Buildr MUST只记录确定性事实
- **AND** MUST NOT声称业务语义安全或替代Agent、Project与既有verification policy

#### Scenario: 贡献变化或无法证明

- **WHEN** Development报告原Task source/Task Contribution、Task Context、policy或gate漂移
- **THEN** Finish MUST返回Task Development rebuild
- **AND** 只有新的formal Verification、Completion Review、handoff与freeze才可增加generation

### Requirement: 当前 Task Finish 必须保持单一窄交付 adapter
Buildr MUST在只有一个真实交付 adapter 时直接使用当前 Product/Git adapter，并 MUST把通用 Task Finish 边界限制为current Development Handoff、Delivery Carrier preparation、carrier equivalence、delivery effects、cleanup eligibility与run/resume facts。Git remote、branch、fast-forward与push MUST留在Git delivery实现，Buildr sync/Doctor/CLI/Local App install MUST留在Product retained activation，Task-owned resource/provider cleanup MUST只由Task Environment Application执行。Buildr MUST NOT在第二种真实adapter、明确selection authority和独立E2E fixture出现前创建公共adapter registry、插件协议、第二capability graph或通用transaction/state-machine框架。

#### Scenario: 当前只有 Git direct-to-target adapter
- **WHEN** package与runtime只登记当前Buildr Product的Git direct-to-target delivery
- **THEN** Task Finish MUST直接选择该确定性Product adapter并执行固定五阶段
- **AND** MUST NOT要求调用方选择adapter kind、provider id、execution plan或未来delivery type

#### Scenario: Product retained activation适用
- **WHEN** Delivery Carrier改变runtime、默认CLI或Local App正式影响路径
- **THEN** 当前Product adapter MUST在deliver内执行适用的retained sync/Doctor/install并记录not-applicable或真实结果
- **AND** 通用Development handoff、Candidate或Task Environment schema MUST NOT获得Buildr/Git/Node/npm常量

#### Scenario: 没有满足条件的新交付路径
- **WHEN** non-Git、multi-repo、task-branch、PR、release或deploy没有同时具备真实consumer、持久目标、equivalence、authorization、cleanup eligibility与独立E2E fixture
- **THEN** 当前Change MUST保持这些路径未实现
- **AND** MUST NOT为Roadmap完整性预建selection、registry、receipt或兼容层

### Requirement: Blocked Task Finish 必须只返回一个当前恢复动作
Task Finish MUST根据current Development applicability与run-owned事实返回唯一`nextWorkflow`或`nextAction`。只有Task Development Application报告source、Task Context、policy、gate或handoff真实stale时 MUST返回`nextWorkflow: task-development`；Delivery Adaptation、target-race、retained activation或cleanup暂态阻塞 MUST保持同一run并只返回产品生成的current exact resume token及一个明确动作。

#### Scenario: Delivery Adaptation阻塞
- **WHEN** Task Contribution不能机械应用到最新Delivery Baseline但Development handoff仍current
- **THEN** result MUST只返回在run-owned carrier完成Agent review后以current token恢复同一run的nextAction
- **AND** MUST NOT同时返回Task Development rebuild、Candidate generation或formal Verification动作

#### Scenario: Development applicability真实stale
- **WHEN** Task Development Application报告current handoff不再适用
- **THEN** result MUST只返回`nextWorkflow: task-development`
- **AND** MUST NOT保留一个与Development rebuild竞争的Finish resume动作

### Requirement: Finish repository 必须支持按 Task 安全读取既有 completed Result
Task Finish MUST 提供最窄的按 Task 只读查询，复用 `.buildr/task-finish/runs/<run-id>.json` 与 `.buildr/task-finish/completed/<run-id>.json` 现有 authority。查询 MUST 校验固定目录、普通 JSON 文件、current schema、Task identity 与 completion identity，MUST NOT 新增 writer、数据库表、索引、缓存或聚合 store。

#### Scenario: 多个 run 中后续成功
- **WHEN** 同一 Task 先有 blocked/failed run，后来存在身份匹配的 complete Result
- **THEN** 查询 MUST 返回匹配的成功 complete Result
- **AND** 旧失败 run MUST NOT 覆盖成功事实

#### Scenario: Finish 文件损坏
- **WHEN** 与目标 Task 相关的候选 Finish 文件无法安全解析或 completion identity 不完整
- **THEN** 查询 MUST 返回不可安全核验诊断
- **AND** MUST NOT 跳过关键损坏后推断 delivered

### Requirement: delivered 必须由完整 Finish 事实 fail closed 派生
terminal delivery projection MUST 至少验证 Task completed 且非 noChange、Finish status 与 completion complete、Task ID、handoff identity、Candidate identity/generation、Content Target identity、carrier equivalence、remote readback、retained activation/Doctor 与 Environment cleanup。任一关键事实缺失或不匹配时 MUST NOT 返回 delivered。

#### Scenario: 完整匹配的成功交付
- **WHEN** 全部 Task、handoff、Candidate、Content Target、carrier、remote 与 cleanup facts 完整匹配
- **THEN** projection MUST 返回 delivered、final remote ref、完成时间与 cleanup 摘要

#### Scenario: 任一关键 identity 不匹配
- **WHEN** Finish taskId、handoff、Candidate identity/generation 或 Content Target identity 任一不匹配
- **THEN** projection MUST fail closed 为 completed-unproven 或 unavailable
- **AND** MUST NOT 显示 delivered

### Requirement: Deliver 必须识别已完整包含 Carrier 的前进 Target
当 observed target ref在当前Delivery Carrier准备后前进时，Task Finish MUST在返回target-race前确定性检查最新target是否完整包含该carrier。包含证明 MUST同时要求carrier head是observed target的Git ancestor、carrier全部changed paths在observed target保持相同after mode/blob或删除状态，并且current Development carrier equivalence仍成立；不得只凭路径不重叠、commit message或调用方声明放行。

#### Scenario: 最新 target 完整包含已推送 carrier
- **WHEN** observed target是carrier head的后代，且carrier每个changed path的after mode/blob在observed target完全保持
- **THEN** deliver MUST记录`targetDisposition: already-contained`，跳过重复Task Contribution apply、fast-forward与push，并继续retained activation、Doctor和cleanup
- **AND** Result MUST同时保留原carrier ref、containment evidence与最新final remote ref，Candidate generation与`formalVerificationExecutions`保持不变

#### Scenario: 后续提交改变 carrier 路径
- **WHEN** observed target虽然是carrier head的后代，但任一carrier changed path的mode/blob或删除状态不再匹配
- **THEN** deliver MUST保持`task-finish.target-race`并通过精确token恢复现有prepare/Delivery Adaptation路径
- **AND** MUST NOT把ancestry、无冲突历史或其余路径一致解释为完整包含

#### Scenario: 祖先或远端对象无法证明
- **WHEN** fetch失败、carrier不是observed target的ancestor，或target tree状态无法读取
- **THEN** deliver MUST fail closed并返回当前target-race诊断
- **AND** MUST NOT修改原Task worktree、Candidate、Verification Result或远端target

### Requirement: Task Finish 必须在完整成功后提交顶层 Task 终态
Formal Task Finish MUST 在远端交付、retained activation/Doctor、Task Environment cleanup 与 run-owned Delivery Carrier cleanup 全部成功后，通过 Task Record Application 将对应 active Task 提交为 `completed` 且 `result.noChange=false`。Task Finish MUST NOT 直接写 Workspace SQLite、复制 Task Record authority，或在任一 deliver/cleanup 动作 blocked、failed、未执行时提前改变 Task 顶层状态。只有 Task Record Application 提交成功或确认既有等价 completed 终态后，Finish completion 才可从 `prepared` 进入 `complete`。

#### Scenario: 完整收尾后自动完成 Task
- **WHEN** Formal Finish 的 delivery、Environment cleanup 与 Delivery Carrier cleanup 全部成功，且 Task Record 仍为 active
- **THEN** Task Finish MUST 通过 Task Record Application 写入 `status: completed` 与 `result.noChange: false`
- **AND** Finish Result MUST 在该提交成功后返回 complete

#### Scenario: 收尾阻塞不改变 Task
- **WHEN** delivery、Environment cleanup、Delivery Carrier cleanup 或 Task Record Application 提交任一步骤 blocked 或 failed
- **THEN** Task Finish MUST NOT 把 active Task 冒充为 completed
- **AND** run MUST 保留可恢复事实与具体 primary failure

#### Scenario: 已完成 Task 的幂等恢复
- **WHEN** Finish resume 观察到同一 Task 已是 `completed` 且 `result.noChange=false`
- **THEN** Task Record Application MUST 返回幂等成功且不产生重复 mutation effect
- **AND** Task Finish MAY 继续写入匹配的 complete completion

#### Scenario: 冲突终态阻止 Finish 完成
- **WHEN** Finish 提交终态时 Task 已是 `completed/noChange=true` 或 `abandoned`
- **THEN** Task Record Application MUST 保留原终态并返回冲突
- **AND** Task Finish MUST 保持 blocked 且不得写入 complete completion

### Requirement: Finish completion 必须写入采用的 gate 关联
Task Finish 在完成 Task Record 交付终态时 MUST 投影其 current Development handoff 中冻结的 Planning、Verification 与 Completion gate 关联。Finish MUST 使用 handoff 中的最小 identity/digest，而不是读取后续变化的专业 Result；投影失败 MUST 保留可恢复诊断并阻止 success completion。

#### Scenario: Finish 采用 current handoff
- **WHEN** Finish 已验证 current handoff 并完成 delivery 与 cleanup
- **THEN** completion projection MUST 记录该 handoff、Candidate 和三个采用 gate 的 identity/digest
- **AND** MUST NOT 执行新的 Review、Verification 或 gate 决定

### Requirement: Task Finish transient data 必须按 run 登记并在成功后清理
Task Finish MUST只在run-owned transient root保存完整stdout/stderr、命令诊断和Delivery Carrier，并 MUST在Workspace SQLite登记kind、受限locator、SHA-256、大小与retention/cleanup状态。terminal completion MUST仅在Environment cleanup与全部Finish-owned transient cleanup完成后成立；cleanup失败 MUST保持同一run为`cleanup_pending`并支持幂等resume。

#### Scenario: blocked run 保留恢复材料
- **WHEN** current run因target-race、Delivery Adaptation、远端暂态失败或Environment cleanup blocked而可恢复
- **THEN** Buildr MUST保留该run精确恢复所需的registered transient data与lease事实
- **AND** MUST NOT保留无登记文件、其他run内容或把完整日志写入SQLite payload

#### Scenario: Environment 已清理但 Finish transient cleanup 尚未完成
- **WHEN** Environment Receipt已经证明cleaned，但进程在删除diagnostics/Carrier或提交completion前失败
- **THEN** resume MUST只重试Finish-owned cleanup、completion与Task terminal transition
- **AND** MUST NOT重跑prepare、verify、deliver、remote push或Environment provider cleanup

#### Scenario: Finish 成功完成
- **WHEN** delivery、remote readback、retained action、Doctor、Environment cleanup与Finish-owned cleanup全部通过
- **THEN** Buildr MUST释放target lease，删除该run的transient files与current rows，并原子保留compact terminal Result
- **AND** MUST NOT留下`.buildr/task-finish` current files、orphan Carrier或完整命令日志

#### Scenario: transient locator 越界
- **WHEN** registered或发现的artifact locator为绝对路径、逃逸canonical Workspace或经symlink指向run-owned root之外
- **THEN** cleanup MUST拒绝删除并返回安全诊断
- **AND** MUST NOT扩大到Workspace root、其他Task或用户目录
