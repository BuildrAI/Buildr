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

创建新的Task Finish run之前，产品入口 MUST同样一次观察当前可解析的Environment、Development handoff与交付target/remote事实，不得在第一项失败处短路；观察 MUST复用各模块既有检查事实，不得另造检查器。入口缺口 MUST按模块分类为`development`、`environment`、`delivery`。只要存在任一入口缺口，产品 MUST NOT创建Finish run、MUST NOT open Finish execution record，也 MUST NOT开始五阶段。存在`development`缺口时，结果 MUST路由`task-development`；Finish MUST NOT把Change archive、Verification/Review正文或`clean commit`做成独立入口硬门禁。

#### Scenario: 候选同时存在多个廉价问题
- **WHEN** Development handoff stale、receipt-bound CLI不可执行且目标ref不可用
- **THEN** preflight MUST在同一结果中按check identity返回全部可同时观察的问题
- **AND** prepare、verify、deliver与cleanup MUST保持未执行

#### Scenario: Receipt 只证明路径身份
- **WHEN** Task Development Application报告handoff missing、blocked或stale
- **THEN** Finish MUST返回`nextWorkflow: task-development`
- **AND** MUST NOT从Task Record、Git、Change、Review或Verification自行重建handoff

#### Scenario: 创建 run 前同时存在多模块入口缺口
- **WHEN** 调用方执行`buildr task finish run --task <id>`，且当前可同时观察到Environment未ready与Development handoff缺失或stale
- **THEN** 产品 MUST在同一失败结果中同时返回`environment`与`development`分类缺口
- **AND** MUST NOT创建Finish run或execution record
- **AND** MUST将下一步路由为`task-development`

#### Scenario: 仅交付入口缺口
- **WHEN** Environment ready且Development handoff current，但delivery remote无法确定或target branch不可用
- **THEN** 产品 MUST只在`delivery`分类中返回缺口，并拒绝创建run
- **AND** MUST NOT把该失败表述为Development handoff缺陷

### Requirement: Task Finish 必须只接受 finish-ready candidate

进入Task Finish的Candidate MUST由Task Development Application生成并通过current handoff交接；该handoff MUST已闭合Content Target、Task context、verification policy、Planning/Verification/Completion gates与proceed decision。Task Finish MUST冻结handoff、Candidate、generation与Content Target identity，并在preflight、prepare、verify、deliver及复用阶段输出的resume前，通过Development Application精确断言四项仍等于`observed.currentHandoff`。Task Finish MUST NOT自行遍历历史handoffs判断currentness，也 MUST NOT执行额外Review、formal Verification、risk decision、Candidate generation或Candidate applicability判断。Development Application报告的内容、context、policy、gate或handoff漂移 MUST退出当前Finish并回到Development；Finish自己的Git conflict只表示机械应用失败或需要语义判断，MUST进入隔离Delivery Adaptation而不得宣称Candidate stale。

#### Scenario: Preflight 发现产品缺陷

- **WHEN** Development Application报告Candidate/handoff不再current
- **THEN** run MUST标记terminal `failed`并返回`nextWorkflow: task-development`
- **AND** MUST NOT在Finish中编辑内容、修改decision或补写专业Result

#### Scenario: 历史handoff不能使旧run通过

- **WHEN** Development receipt同时保留历史handoff A和current handoff B，而run冻结A
- **THEN** preflight及后续阶段 MUST因精确identity mismatch停止
- **AND** MUST NOT从历史handoffs取回A或从B的Task source形成A的carrier

#### Scenario: carrier等价核验失败

- **WHEN** current handoff对应的Task Contribution不能机械应用到最新Delivery Baseline
- **THEN** run MUST blocked并返回`delivery-adaptation-required`或`semantic-review-required`
- **AND** MUST NOT归类为`upstream-candidate-defect`、写Development Receipt或声明任何Development fact stale

#### Scenario: 正式保证发现测试失败

- **WHEN** Development handoff缺少current Verification gate、Result为stale/incomplete，或未形成允许推进的Development decision
- **THEN** Finish MUST在preflight返回`nextWorkflow: task-development`
- **AND** MUST NOT在Finish内执行formal Verification、读取Result store或接受风险

#### Scenario: push前handoff漂移

- **WHEN** prepare或verify已完成后Development形成新的current handoff
- **THEN** deliver MUST在取得target lease或push前停止并使旧阶段复用失效
- **AND** MUST保持零push且保留既有run evidence

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
- **WHEN** Development Candidate改变runtime、默认CLI或Buildr Web的正式影响路径
- **THEN** deliver MUST使用receipt-bound retained root、CLI与Node identity执行相应doctor/sync/install
- **AND** 未受影响入口 MUST记录not-applicable reason而不执行安装

### Requirement: Resume 必须由产品根据真实状态生成

Task Finish MUST根据current run、Development handoff、Task Contribution、Delivery Baseline、carrier observations、target ref与retained/cleanup真实状态生成最早可恢复边界和`resumeToken`。Content Target与handoff仍精确等于run冻结identity的target lease、target race、Delivery Adaptation、retained或cleanup阻塞 MAY在同一run恢复。调用方 MUST NOT提供recovery manifest、Candidate、step fingerprint、execution plan、claimed semantic equivalence或冲突解决结果boolean。若current handoff已变化，只有可证明尚无carrier、lease、delivery、retained、prepared completion或cleanup事实，且只停止于preflight或carrier ownership形成前无resume token的terminal failed prepare的旧run MAY以类型化superseded终结并保留Execution Record；preflight-only blocked旧run MAY保留其preflight resume token。新handoff MUST由新run重新提交并冻结commit message。已有任一上述副作用或恢复事实、prepare为blocked、prepare仍有resume token、后续阶段已经开始或阶段状态无法证明的旧run MUST保持原identity与现场并返回类型化current-run identity conflict，MUST NOT自动删除、终结或换绑。Cleanup MAY根据已持久化delivery/cleanup facts恢复，MUST NOT因交付后Development形成新handoff而丢弃必要清理。

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
- **AND** 已通过的prepare/verify MUST仅在Development Application仍报告精确冻结identity current时复用

#### Scenario: preflight-only旧run安全失效

- **WHEN** blocked或failed旧run的handoff已变化，且只有preflight开始、没有carrier、lease、delivery、retained、prepared completion或cleanup事实
- **THEN** 产品 MUST以`task-finish.development-handoff-superseded`终结旧run并保留Execution Record
- **AND** current handoff的新run MUST要求调用方重新提供commit message并冻结独立message identity；旧run的preflight resume token MUST NOT阻止该安全失效

#### Scenario: carrier形成前prepare失败安全失效

- **WHEN** 旧run的preflight已通过、prepare因`carrier-preparation` terminal failed，verify、deliver和cleanup从未开始，且没有carrier、lease、resume、delivery、retained、prepared completion或cleanup事实
- **THEN** 产品 MUST允许current handoff以新的commit message创建新run，并以`task-finish.development-handoff-superseded`处置旧run
- **AND** MUST保留旧invocation的Execution Record，不重试或换绑旧run

#### Scenario: prepare状态无法证明无副作用

- **WHEN** 旧run在prepare blocked、持有resume token、已有后续阶段attempt、存在owner fact，或failure不是可识别的carrier ownership形成前terminal failure
- **THEN** 产品 MUST返回`task-finish.current-run-identity-conflict`并保留现场
- **AND** MUST NOT因carrier字段为空就自动supersede旧run

#### Scenario: 已有副作用事实的旧run保留现场

- **WHEN** 旧run的handoff已变化，且存在carrier、lease、delivery、retained或cleanup事实
- **THEN** 产品 MUST返回`task-finish.current-run-identity-conflict`并保留run、资源ownership和resume evidence
- **AND** MUST NOT自动删除、终结或把旧run换绑到current handoff

#### Scenario: retained Doctor同identity恢复

- **WHEN** run只因retained Doctor阻塞，且Development精确冻结identity仍current
- **THEN** matching resume token MAY在同一run恢复retained与cleanup
- **AND** MUST不创建新run或要求新的commit message

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
Canonical Task Finish MUST在Workspace SQLite唯一`task_finish_current` row中保存`buildr.task-finish-run/v2`所需current事实，并返回compact `buildr.task-finish-result/v2`，MUST NOT新建第二个Finish Receipt authority。普通列 MUST直接表达Task、Development handoff、Candidate/Content Target、carrier/target identity、总体状态、current phase、current primary failure、resume/development workflow、cleanup与terminal association；`phases_json` MUST只保存受验证的固定五阶段current status、timing与下游恢复必需的compact owner facts，有界payload只保存公开结果重建所需的其他非查询详情。阶段attempt的checks、operations、observations、stdout/stderr preview、旧failure history与execution record identity/status MUST NOT写入current row；完成后同一row MUST原位替换为绑定同一事实的compact terminal Result与compact phases，且 MUST不投射Finish-owned change kind或verification authority。

#### Scenario: 正常路径完成
- **WHEN** 五阶段全部成功或not-applicable，且Finish-owned cleanup完成
- **THEN** terminal current row与result MUST报告`status: complete`、durable completion和全部效率字段，且同Task MUST不存在第二份current run、phase或completion authority
- **AND** MUST明确`formalVerificationExecutions: 0`、`agentProviderCompletions: 0`与`manualRecoveryManifests: 0`

#### Scenario: 中途失败
- **WHEN** 任一阶段blocked或failed
- **THEN** SQLite current普通列、compact phases与result MUST共同表达current phase、primary operation/code/status、diagnostic identity和唯一next workflow/action
- **AND** 完整attempt operations、observations、output与已解决历史失败 MUST只进入本invocation diagnostics transient/execution record，不得继续作为current primary事实

#### Scenario: 状态字段与有界详情不一致
- **WHEN** payload中的phase、failure、resume或terminal association与对应普通列不一致
- **THEN** Domain/repository MUST拒绝写入并rollback整个checkpoint
- **AND** reader MUST NOT以JSON、execution record或transient files覆盖普通列或猜测哪一份状态更新

### Requirement: 客户端升级必须直接替换 Task Finish 实现
Buildr Client升级后 MUST直接以Workspace SQLite-backed五阶段执行器替换旧Task Finish实现，并 MUST只使用`task_finish_current`及行内嵌target lease authority。客户端 MUST NOT继续使用SQLite旧四表、`.buildr/task-finish/runs`、`completed`或文件lease作为current authority，也 MUST NOT创建并行协议目录、长期双写、permanent legacy reader、cutover adapter或第二套executor。旧File Store数据 MUST不被迁移或恢复；旧SQLite专业数据只允许由连续migration一次性安全收敛。

#### Scenario: 升级后存在旧的未完成 run shape
- **WHEN** SQLite-only runtime启用前发现旧File Store中存在未完成、blocked、failed、未知schema或无法复核的run
- **THEN** 受控升级步骤 MUST直接删除旧目录；新Finish MUST依据SQLite current上游与环境事实建立新run
- **AND** 客户端 MUST NOT读取、导入、advance、finalize、转换或继续该旧File Store run

#### Scenario: 升级后存在可验证的已完成交付
- **WHEN** SQLite-only runtime启用前发现旧File Store中存在看似已完成的run/completion
- **THEN** 受控升级步骤 MUST直接删除旧目录，不得配对、导入或恢复其completion
- **AND** 新Result MUST只由SQLite-backed Finish重新产生

#### Scenario: 升级已有 SQLite Finish 状态
- **WHEN** canonical Workspace Structured Store仍使用旧run/completion/lease/artifact四表且数据可证明一致
- **THEN** retained migration MUST将其收敛到`task_finish_current`并删除旧四表
- **AND** 新runtime MUST不保留旧表reader、writer、view、trigger或长期兼容分支

#### Scenario: SQLite 旧状态无法安全迁移
- **WHEN** 旧SQLite状态存在损坏identity、phase、lease owner或未完成artifact cleanup
- **THEN** migration MUST fail closed并完整rollback
- **AND** 新writer MUST NOT部分启用新schema、丢弃旧状态或形成双写

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

`prepare` MUST在产品拥有的隔离位置，以最新Delivery Baseline机械形成承载current Development Candidate之Task Contribution的可交付ref。Task source snapshot MUST从原任务基线与当前Task工作树精确构造新增、修改和删除后的tree；当前已删除的基线路径 MUST通过临时index表达删除，MUST NOT作为必须在工作树中匹配的Git pathspec。它 MAY使用临时Git index、source snapshot tree、binary patch、detached worktree与carrier commit，但 MUST NOT提交、rebase或改写原Task worktree/index/branch，MUST NOT执行OpenSpec convergence/archive、runtime内容sync、生成资产收敛、语义冲突resolution、Candidate freeze或generation。Clean apply必须记录`deterministic-reuse`；机械失败必须保留run-owned baseline carrier并返回Delivery Adaptation facts。

#### Scenario: 未提交内容形成carrier commit

- **WHEN** exact Candidate source可在最新Delivery Baseline无冲突应用并确定性核验原Task Contribution identity
- **THEN** prepare MUST只在隔离carrier中commit并记录Task Contribution、Delivery Baseline、changed paths、mode/blob与carrier ref
- **AND** reuse mode MUST为`deterministic-reuse`，原Task worktree、Candidate/generation与专业Result保持不变

#### Scenario: 未提交归档重命名进入source snapshot

- **WHEN** Task工作树把已跟踪的active Change目录移入archive，旧路径已经不存在且新路径尚未提交
- **THEN** source snapshot MUST包含旧路径删除和archive路径新增，并可继续形成Task Contribution
- **AND** MUST不修改原Task index、工作树或把旧路径作为必须存在的exact pathspec

#### Scenario: 最新基线已前进且贡献等价

- **WHEN** 最新Delivery Baseline不同于原任务基线，但Git应用无冲突且应用后的canonical delta identity等于原Task Contribution
- **THEN** prepare MUST进入verify并复用原handoff
- **AND** reuse mode MUST为`deterministic-reuse`且不得执行formal Verification或Completion Review

#### Scenario: Git apply conflict需要Delivery Adaptation

- **WHEN** Task Contribution与最新Delivery Baseline发生机械Git conflict，且Development handoff仍current
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
Task Finish MUST对无Changehandoff完全省略Change tasks、knowledge impact、OpenSpec plan/check/convergence/archive operations，MUST NOT新增`candidateKind`或`changeContext`字段重新拥有分类。结果与completion evidence MUST包含Task、Candidate、handoff、Content Target与carrier identity。

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
Buildr MUST在只有一个真实交付 adapter 时直接使用当前 Product/Git adapter，并 MUST把通用 Task Finish 边界限制为current Development Handoff、Delivery Carrier preparation、carrier equivalence、delivery effects、cleanup eligibility与run/resume facts。Git remote、branch、fast-forward与push MUST留在Git delivery实现，Buildr sync/Doctor/CLI/Buildr Web install MUST留在Product retained activation，Task-owned resource/provider cleanup MUST只由Task Environment Application执行。Buildr MUST NOT在第二种真实adapter、明确selection authority和独立E2E fixture出现前创建公共adapter registry、插件协议、第二capability graph或通用transaction/state-machine框架。

#### Scenario: 当前只有 Git direct-to-target adapter
- **WHEN** package与runtime只登记当前Buildr Product的Git direct-to-target delivery
- **THEN** Task Finish MUST直接选择该确定性Product adapter并执行固定五阶段
- **AND** MUST NOT要求调用方选择adapter kind、provider id、execution plan或未来delivery type

#### Scenario: Product retained activation适用
- **WHEN** Delivery Carrier改变runtime、默认CLI或Buildr Web正式影响路径
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
Task Finish MUST只在run-owned bounded root保存其仍需恢复的Delivery Carrier或临时材料，并在`task_finish_current`的受验证payload中保存精确cleanup locator/status；MUST NOT建立per-artifact SQLite metadata authority。terminal completion MUST仅在Environment cleanup与全部Finish-owned recovery resource cleanup完成后成立；cleanup失败 MUST保持同一current row为`cleanup_pending`并支持幂等resume。独立execution-record producer MUST在单独invocation-owned diagnostics transient中保存完整stdout/stderr与大体量诊断，且其record identity、status、history、body locator与cleanup state MUST NOT写入Finish current或取得Carrier/target/resume authority。

#### Scenario: blocked run 保留恢复材料
- **WHEN** current run因target-race、Delivery Adaptation、远端暂态失败或Environment cleanup blocked而可恢复
- **THEN** Buildr MUST只保留该run精确恢复所需的bounded transient data、carrier locator与内嵌lease事实
- **AND** execution record retained或diagnostics cleanup MUST NOT删除、替代或延长这些Finish-owned恢复材料

#### Scenario: Environment 已清理但 Finish transient cleanup 尚未完成
- **WHEN** Environment Receipt已经证明cleaned，但进程在删除Carrier/临时材料或提交terminal state前失败
- **THEN** resume MUST只重试Finish-owned cleanup、terminal current替换与Task terminal transition
- **AND** MUST NOT重跑prepare、verify、deliver、remote push、Environment provider cleanup或依赖execution record恢复owner facts

#### Scenario: Finish 成功完成
- **WHEN** delivery、remote readback、retained action、Doctor、Environment cleanup与Finish-owned recovery resource cleanup全部通过
- **THEN** Buildr MUST释放内嵌target lease、删除该run的Finish-owned recovery data并原子保留compact terminal current row
- **AND** execution record producer MUST独立按retained-before-cleanup规则处置invocation diagnostics，不得阻止或回滚已成立的Finish completion

#### Scenario: transient locator 越界
- **WHEN** Finish current或diagnostics producer的cleanup locator为绝对路径、逃逸canonical Workspace或经symlink指向owner root之外
- **THEN** 对应owner cleanup MUST拒绝删除并返回安全诊断
- **AND** MUST NOT扩大到另一owner、Workspace root、其他Task或用户目录

### Requirement: Retained Doctor必须绑定当前Agent并保留可恢复交付事实
Task Finish deliver MUST使用run identity绑定的Agent执行retained Doctor。Doctor非零、输出无效或`health.ready`不为true时，普通run MUST保持blocked且不得进入cleanup；当carrier交付、remote readback和containment已经完成时，blocked Result MUST保存这些partial delivery facts与产品生成的matching resume token，使外部条件修复后可以恢复同一run。Product MUST NOT提供跳过Doctor的成功参数或把blocked结果改写为passed。

#### Scenario: 普通Workspace指定Agent Doctor失败
- **WHEN** 未安装自举增强的Workspace完成carrier push/readback，但`doctor --agent <run-agent>`不ready
- **THEN** deliver MUST返回retained Doctor blocked并保留current run与resume token
- **AND** cleanup、Task terminal completion与成功delivery结论 MUST不发生

#### Scenario: Doctor blocked后保留partial delivery
- **WHEN** remote target已等于carrier或可证明完整包含carrier，随后retained Doctor失败
- **THEN** compact Result MUST包含carrier、remote refs、target disposition、containment、activation plan与Doctor blocked disposition
- **AND** MUST不创建第二份Finish Receipt、activation store或recovery manifest

#### Scenario: 外部条件修复后恢复同一run
- **WHEN** 调用方使用matching run id与产品resume token恢复Doctor-blocked run
- **THEN** Product MUST重新核对target containment、retained cleanliness和current handoff，并重新执行指定Agent Doctor
- **AND** 只有最终Doctor ready时 MUST进入cleanup并形成Formal Finish complete

### Requirement: Task Finish execution 必须由 record open gate 启动
Task Finish Application MUST在调用前参数、Task、ready Environment、current Development handoff、target/remote、resume token与completed/no-op判断完成后，为需要真正执行的invocation先open `task-finish/finish-diagnostics` record。open成功前 MUST不创建、替换或失效Finish current，不得创建/删除Carrier、获取lease、启动执行期target mutation/observation、写diagnostics transient、丢弃旧run或改变任何恢复资源；调用前确定target/remote identity所需的只读校验不属于producer execution。

#### Scenario: record capacity backpressure
- **WHEN** 固定record reservation因Task/owner或Workspace quota被拒绝
- **THEN** `task finish run` MUST返回blocked execution record operation summary且不得启动五阶段
- **AND** 既有或缺失的`task_finish_current`、remote ref、Carrier、target lease、resume与恢复资源 MUST逐项保持不变

#### Scenario: open成功后首次执行
- **WHEN** invocation通过校验且record open成功
- **THEN** Application MAY建立invocation diagnostics transient并创建或恢复Finish run，然后按固定五阶段执行
- **AND** 旧failed run/Carrier的任何受控失效或清理 MUST作为本invocation operation发生在open之后

#### Scenario: invalid resume token
- **WHEN** caller对既有blocked或cleanup-pending run提供缺失、不匹配或过期token
- **THEN** Application MUST在record open前拒绝调用并保持current与恢复资源不变
- **AND** MUST返回`executionRecord.status: not-opened`且不得创建diagnostics transient

### Requirement: execution record 失败不得成为第二 Finish terminal authority
Task Finish MUST先按既有owner规则持久化每个阶段、delivery、cleanup与Task terminal事实，再独立seal invocation execution record。record seal、metadata确认或diagnostics cleanup失败 MUST只影响additive execution record operation summary；MUST NOT回滚、重写或重放已成立的Finish current、remote、Environment、Carrier或Task terminal facts。

#### Scenario: Finish complete但record seal失败
- **WHEN** Finish已完成delivery、Environment cleanup、Carrier cleanup与Task terminal transition，但record无法证明retained
- **THEN** result MUST保持`status: complete`并返回`executionRecord.status: attention`与保留transient的next action
- **AND** MUST NOT把Finish改写为blocked/failed、重新创建Carrier、重复push或撤销Task completed

#### Scenario: Finish blocked且record retained
- **WHEN** invocation在target race、Delivery Adaptation、Doctor或cleanup边界停止且record以blocked retained
- **THEN** Finish result MUST保持原current failure、resume token与恢复资源，executionRecord只报告本invocation evidence lifecycle
- **AND** 后续resume MUST创建新record且不得从旧record重建Finish owner state

#### Scenario: task finish inspect
- **WHEN** caller运行只读`task finish inspect`
- **THEN** result MUST只投影`task_finish_current`的current/terminal read model
- **AND** MUST NOT枚举、读取或反向关联execution records，也不得因record attention改变Finish applicability

### Requirement: Task Finish Result 必须报告只读解析上下文
`buildr.task-finish-result/v2` MUST以additive `resolvedContext`报告本次run从既有Task、Development handoff、Environment和delivery target事实中解析出的最小上下文，包括`buildr.task-finish/v1` capability identity、Task/handoff/Candidate/Content Target identity、Agent、target branch、remote与该集合的确定性identity。`resolvedContext` MUST只由产品生成，不得作为run输入、可编辑execution capsule、独立数据库列、Receipt、恢复manifest或第二authority。

#### Scenario: 新run形成解析上下文
- **WHEN** `task finish run`通过入口readiness并创建新的Finish run
- **THEN** run与后续inspect/terminal Result MUST返回由同一run identity确定性形成的`resolvedContext`
- **AND** 调用方 MUST不需要提交contract版本、handoff、Environment、Candidate或delivery plan

#### Scenario: inspect读取terminal Result
- **WHEN** 调用方按run id inspect已完成或blocked的Finish Result
- **THEN** `resolvedContext` MUST与该run采用的identity保持一致
- **AND** reader MUST NOT重新解释当前Task、Environment或后续变化来改写历史解析上下文

#### Scenario: 读取缺少字段的既有v2 Result
- **WHEN** Workspace中存在本变更前写入且没有`resolvedContext`的合法`buildr.task-finish-result/v2`
- **THEN** 兼容reader MUST允许该字段为null或按已保存run identity只读派生
- **AND** MUST NOT迁移历史Result、建立补写任务或把缺失字段解释为交付失败

### Requirement: Task Finish 必须冻结有语义的交付提交信息
首次创建 Git-backed Task Finish run 时，Buildr MUST 要求 Agent 提供符合当前 Workspace、Project、Service 与 repository 约定的完整交付提交信息，并 MUST 在任何 Finish current、Delivery Carrier 或 target 副作用前完成规范化与校验。产品 MUST NOT 根据 Task ID、Change ID、diff、文件路径或内部 lifecycle facts自动推断 `type`、`scope` 或主题，也 MUST NOT继续为新run生成“交付 + Task ID”的占位主题。

规范化后的提交信息 MUST 包含非空 subject，MUST 将当前 Task ID 保存为 `Buildr-Task` trailer，并 MUST以稳定identity绑定到同一逻辑run。完整message只能由Task Finish owner作为恢复事实持有并写入实际Git commit；Task Record、Development Receipt、Environment Receipt与其他authority MUST NOT复制正文。公开Finish Result MUST只返回subject与message identity。

#### Scenario: 首次运行冻结 Agent 提供的语义提交信息
- **WHEN** Agent 对current handoff首次执行`buildr task finish run`并提供符合仓库约定的subject与可选body
- **THEN** Buildr MUST规范化message、确定性加入当前Task的`Buildr-Task` trailer并在创建任何run或carrier副作用前冻结其identity
- **AND** Delivery Carrier commit的完整message MUST与冻结message一致

#### Scenario: 新运行缺少语义提交信息
- **WHEN** Agent首次启动Git-backed Finish run但没有提供message、提供空subject或subject精确使用“交付 + 当前Task ID”占位格式
- **THEN** Buildr MUST在Finish current、execution record、Delivery Carrier、target和cleanup零副作用状态返回blocked
- **AND**唯一next action MUST要求Agent根据最终内容提供符合当前repository约定的提交信息

#### Scenario: Task ID 只作为追踪 trailer
- **WHEN** Agent提供`fix(task-finish): 保留语义化交付提交信息`作为subject
- **THEN** 实际Delivery Carrier commit MUST保持该subject并包含`Buildr-Task: <task-id>` trailer
- **AND** 产品 MUST NOT把Task ID、Change ID或“交付”操作词替换为subject

#### Scenario: 公开结果不复制正文
- **WHEN** Finish run已冻结包含subject与body的完整message
- **THEN** Task Finish current run MAY保存恢复所需的完整规范化message
- **AND**公开Result与Execution Record MUST只投影subject和message identity，不得复制完整body或建立第二writer

### Requirement: Task Finish 恢复必须复用同一提交信息
Task Finish MUST把规范化交付提交信息作为run-owned immutable恢复事实。`prepare`重试、target-race、Delivery Adaptation与`--run/--resume`恢复 MUST复用同一message identity，不得要求Agent重新生成、不得接受调用方覆盖，也不得因Delivery Baseline变化重新推断message。

已有current run缺少新字段时，兼容reader MAY只为该既有run恢复其已经持久化或已经形成的legacy carrier message；新run MUST NOT使用legacy fallback。任何Agent-reviewed Delivery Adaptation形成的最终carrier HEAD MUST保留冻结message，否则恢复 MUST blocked且不得deliver。

#### Scenario: blocked run 使用冻结信息恢复
- **WHEN** run已在prepare、target-race或cleanup阶段blocked并持有product-generated resume token
- **THEN** Agent使用`--run <id> --resume <token>`恢复时 MUST不重新提交message且产品 MUST复用原identity
- **AND**恢复不得改变carrier commit subject、body或`Buildr-Task` trailer

#### Scenario: 恢复时尝试覆盖提交信息
- **WHEN** 调用方对已有run同时提供新的提交信息
- **THEN** Buildr MUST拒绝该覆盖或明确忽略非适用输入且保持原run identity
- **AND**不得修改已存在的carrier、target或Finish current facts

#### Scenario: Delivery Adaptation 改变 carrier message
- **WHEN** Agent在run-owned carrier完成语义适配但最终HEAD message不再匹配冻结message identity
- **THEN** Task Finish MUST保持blocked并指出carrier message不一致
- **AND**不得deliver、重写原Task worktree或自动amend Agent的适配commit

#### Scenario: 升级前已有 run 继续恢复
- **WHEN** Workspace升级时已经存在缺少`deliveryCommit`字段的blocked或cleanup-pending run
- **THEN** Buildr MAY按该run已有carrier或legacy恢复事实继续完成同一run
- **AND**后续首次创建的新run MUST仍要求Agent提供语义message，不得长期回退占位模板

### Requirement: Task Finish 必须消费仅工作区Task的正式研发交接
Task Finish MUST把workspace-only Task形成的current immutable Development handoff与Project/Service Task handoff等同作为入口authority，并继续执行`preflight → prepare → verify → deliver → cleanup`五阶段。Finish MUST不解释空declarations、workspace coverage gap或风险语义，也 MUST不补跑Verification、重新freeze Candidate或降低Completion Review与proceed门禁。

#### Scenario: workspace-only handoff完成五阶段交付
- **WHEN** workspace-only Task已经以current Content Target、policy、`not-passed` Verification Result、明确风险接受、Completion Review、Candidate和Development handoff满足全部入口门禁
- **THEN** `task finish run` MUST消费同一handoff完成carrier preparation、equivalence、delivery、remote readback和Environment cleanup
- **AND** Result MUST报告`formalVerificationExecutions: 0`并保持原Candidate generation与gate关联

#### Scenario: workspace gap未处置时拒绝Finish
- **WHEN** workspace-only Task缺少current Candidate、Completion Review、proceed decision或Development handoff
- **THEN** Task Finish entry readiness MUST继续返回`task_finish.development_handoff_not_current`
- **AND** environment或delivery ready MUST不绕过Development缺口

### Requirement: Current run factory 必须拒绝identity冲突

`createFinishRun` MUST在返回同Task已有current run前比较规范化请求identity与existing run identity digest。只有两者完全一致时 MAY幂等复用；不同identity MUST抛出稳定`task_finish.current_run_identity_conflict`，不得静默返回旧run。显式run恢复 MUST同样取得current Development handoff并执行精确identity assertion，不得绕过entry readiness。

#### Scenario: existing run identity相同

- **WHEN** 同Task已有current run且请求的handoff、Candidate、generation、Content Target及其他run identity字段完全一致
- **THEN** factory MAY幂等返回existing run
- **AND** MUST不创建重复Execution Record

#### Scenario: existing run identity不同

- **WHEN** 同Task已有current run但请求identity digest不同
- **THEN** factory MUST抛出`task_finish.current_run_identity_conflict`
- **AND** MUST不返回、修改、删除或换绑existing run

#### Scenario: 显式旧run恢复遇到新handoff

- **WHEN** 调用方显式指定旧run，而current Development handoff已变化
- **THEN** Application MUST执行副作用分级并返回superseded或current-run identity conflict
- **AND** MUST不因显式run ID而跳过Development currentness检查

### Requirement: 零差异 Delivery Adaptation 必须由 Agent 显式确认并复用同一 run
当 Task Contribution 不能机械应用到最新 Delivery Baseline，但 Agent 审查确认最新 target 已满足冻结任务语义且无需新增文件差异时，Task Finish MUST 只在 matching blocked run、current exact resume token 与显式零差异确认同时存在时采用零差异 Delivery Adaptation。采用前 MUST 核验 current Development handoff、Candidate/generation、Content Target、Task Contribution source、Delivery Baseline、carrier ownership 与 cleanliness；Result MUST 标记 `agent-reviewed-delivery-adaptation`，不得声称 Buildr 已证明语义等价。

#### Scenario: 显式采用 clean 的零差异 carrier
- **WHEN** current run 因 Delivery Adaptation blocked，调用方提供 matching resume token 与显式零差异确认，且 run-owned carrier 的 HEAD/tree 等于冻结 Delivery Baseline并保持clean
- **THEN** Task Finish MUST采用零 delta identity，不创建 carrier commit、不修改原 Task worktree且不重跑正式 Verification
- **AND** MUST记录 Agent-reviewed zero-delta evidence并继续同一run

#### Scenario: 未显式确认零差异
- **WHEN** adaptation-required carrier 相对 Delivery Baseline 没有 tree delta，但调用方未提供显式零差异确认
- **THEN** Task Finish MUST保持`task-finish.delivery-adaptation-missing`或等价的当前blocked诊断
- **AND** MUST NOT把普通resume或未修改carrier解释为Agent审查结论

#### Scenario: 零差异确认不适用于当前run
- **WHEN** 显式零差异确认用于新run、非prepare adaptation状态、错误token、漂移baseline、dirty carrier或不匹配identity
- **THEN** Task Finish MUST在交付副作用前fail closed并返回canonical诊断
- **AND** MUST NOT写入Agent-reviewed carrier facts、远端ref或Task终态

#### Scenario: 既有 adaptation-required v2 run 原地恢复
- **WHEN** 既有blocked run已保存current Task Contribution trees、Delivery Baseline、run-owned carrier与matching token
- **THEN** 新实现 MUST从这些既有authority派生零差异adoption所需事实并恢复同一run
- **AND** MUST NOT要求迁移SQLite、重建Candidate、重跑Verification或创建新Finish run

### Requirement: 零差异适配必须保留冻结 Task Contribution 的 activation 影响面
Task Finish MUST分别表达 carrier 相对 Delivery Baseline 的实际delta paths与冻结Task Contribution的activation paths。零差异carrier的实际delta paths MUST保持为空；activation paths MUST从冻结original baseline tree与source tree的规范化`--no-renames`差异派生，并供retained activation和self-bootstrap消费。

#### Scenario: 零差异 carrier 命中 runtime 与自举路径
- **WHEN** 零差异适配的冻结 Task Contribution包含Workspace runtime、Buildr CLI、package或Buildr Web Launcher路径
- **THEN** carrier实际`changedPaths` MUST保持为空，而additive activation paths MUST包含规范化原贡献路径
- **AND** retained activation与self-bootstrap MUST按activation paths执行适用动作，不得因carrier delta为空而返回错误的not-applicable

#### Scenario: 旧 Result 没有 activation paths
- **WHEN** consumer读取没有additive activation paths的既有非零carrier Result
- **THEN** consumer MUST回退使用既有`changedPaths`
- **AND** MUST保持旧deterministic与agent-reviewed非零适配行为不变

### Requirement: 稳定的零差异适配必须以 already-contained 完成交付
verify已采用零差异Delivery Adaptation且远端target仍等于冻结Delivery Baseline/carrier HEAD时，deliver MUST记录`targetDisposition: already-contained`并跳过fast-forward与push；随后 MUST继续remote readback、retained activation、Doctor与cleanup。若target再次前进，MUST返回新的target-race恢复事实，不得跨baseline沿用旧Agent审查。

#### Scenario: 零差异 baseline 保持稳定
- **WHEN** prepare/verify采用零差异适配且deliver观察到远端仍等于冻结baseline/carrier HEAD
- **THEN** deliver MUST执行零fast-forward、零push并记录Agent-reviewed already-contained evidence
- **AND** MUST继续activation、Doctor和cleanup，Candidate generation与`formalVerificationExecutions`保持不变

#### Scenario: 零差异审查后 target 再次前进
- **WHEN** deliver观察到远端不再等于零差异适配所绑定的Delivery Baseline
- **THEN** Task Finish MUST返回`task-finish.target-race`与新的exact resume token
- **AND** MUST NOT复用旧零差异审查、自动接受重叠路径或修改共享历史

### Requirement: retained cleanup 必须重建并复核专用零差异 containment proof
当 deliver 已以 Agent-reviewed zero-delta `already-contained` 完成交付并进入 durable cleanup boundary 时，retained cleanup MUST使用与 deliver 相同的专用观察器，从真实 run-owned carrier、Delivery Baseline、target ref与零delta identity重新构造containment proof。它 MUST要求carrier ownership/cleanliness/current facts仍可证明，并 MUST把重建proof与已保存delivery proof整值比较；不得把空changed paths交给要求非空path的通用containment观察器，也不得只信任已保存proof code或identity。

#### Scenario: 零差异交付继续完成cleanup
- **WHEN** current run已保存`agent-reviewed-delivery-adaptation`、`zeroDelta=true`、空actual delta、稳定baseline target、专用already-contained proof与prepared completion，且carrier仍run-owned、registered和clean
- **THEN** retained cleanup MUST重建相同proof并继续Environment、carrier、transient与lease owner cleanup及Task terminal transition
- **AND** MUST NOT重跑deliver、Formal Verification、Candidate或Agent语义审查

#### Scenario: 零差异proof或真实carrier被篡改
- **WHEN** saved proof的code、proof、ref、空paths或identity不匹配，或carrier不再registered/clean、HEAD/tree偏离baseline、actual delta不为空、target ref不再等于baseline
- **THEN** retained cleanup MUST在Environment cleanup与Task terminal transition前fail closed
- **AND** MUST保留当前run、carrier与精确诊断，不得回退为普通empty-path containment或删除不明资源

#### Scenario: 普通already-contained保持原验证
- **WHEN** delivered carrier包含非空changed paths并以普通`already-contained`完成
- **THEN** retained cleanup MUST继续按每个path的mode/blob/删除状态与ancestry重建通用containment proof
- **AND** MUST不把该delivery解释为Agent-reviewed zero-delta

### Requirement: Task Finish CLI detail 投影必须与执行 authority 分离
Task Finish Application MUST从同一个canonical `buildr.task-finish-result/v2`确定性生成CLI detail投影。`full` MUST原样保留canonical Result；`compact` MUST通过closed字段白名单生成`buildr.task-finish-compact-result/v1`，且 MUST不写SQLite、不改变run/result、不查询第二authority、不创建新的恢复或diagnostics store。detail选择 MUST只影响CLI JSON序列化，不得改变五阶段执行、resume、Delivery Carrier、Execution Record、Task terminal或Environment cleanup。

#### Scenario: complete Result 的两种投影
- **WHEN** 同一complete terminal Result分别以compact与full读取
- **THEN** 两者 MUST表达相同run、Task、handoff、Candidate、Content Target、status、delivery与completion结论
- **AND** compact MUST省略full diagnostics并使用独立schema identity

#### Scenario: blocked Result 可恢复
- **WHEN** current run因Delivery Adaptation、target race、retained Doctor或cleanup暂态条件blocked
- **THEN** compact MUST保留current phase、primary failure、唯一next action或workflow、matching resume与恢复所需关键refs
- **AND** Agent MUST不需要读取full Result才能识别并恢复同一run

#### Scenario: compact 投影失败
- **WHEN** canonical Result缺少compact契约要求的run、identity、status或恢复事实
- **THEN** Application MUST fail closed并返回受控CLI错误
- **AND** MUST不补造identity、修改canonical Result或降级为对象展开

### Requirement: Retained Finish 必须提供受控的 phase-provider bootstrap recovery

当retained Task Finish Product phase provider自身导致repair Task停止时，Buildr MUST为合格existing run提供显式bootstrap recovery。retained Task Finish Application、Workspace SQLite repository、Execution Record owner、五阶段状态机与Task Environment cleanup handoff MUST继续作为唯一canonical writer与lifecycle owner。Recovery MAY从授权capsule导入Task Finish Product phase-provider模块及其受验证本地依赖闭包，但MUST NOT执行candidate CLI写canonical Workspace。

#### Scenario: Retained provider执行缺陷阻断repair Task

- **WHEN** existing run的primary failure由状态机标记为`origin=product-phase-provider`、phase为`preflight|prepare`，且carrier、lease、equivalence、delivery、prepared completion、completion与cleanup事实均不存在
- **AND** downstream phase未执行，current Development/Environment仍匹配，用户明确授权该run
- **THEN** retained Application MUST保持run与canonical store ownership
- **AND** MAY从run-owned capsule执行修复后的Product phase provider
- **AND** MUST保持同一handoff、Candidate/generation与Content Target

#### Scenario: Failure不在受支持边界

- **WHEN** failure缺少provider origin、属于普通readiness/external/upstream/semantic blocker、位于prepare之后、已有交付副作用，或源于CLI/registry/Application/repository/migration层
- **THEN** bootstrap recovery MUST在capsule side effect与candidate import前fail closed
- **AND** MUST保留原Finish Result与owner-specific recovery边界

### Requirement: Bootstrap recovery必须在Execution Record gate后使用current冻结来源

Retained Application MUST在创建任何recovery resource前，使用current Task Environment与Task Development authority证明run绑定的canonical Workspace、execution root、handoff、Candidate/generation和Content Target仍current。Source MUST是同一Environment的非symlink、clean、committed Git checkout，且MUST与canonical Workspace共享同一Git common directory。只有独立Finish Execution Record open成功后，Application才MAY创建或复用capsule。

#### Scenario: Current clean candidate形成capsule

- **WHEN** 合格run的current Environment checkout为clean committed状态，且重新观察的source content等于冻结Content Target
- **AND** Finish Execution Record open gate成功
- **THEN** retained Application MUST从精确source commit创建或接管唯一deterministic run-owned capsule
- **AND** MUST把capsule绑定到run、handoff、Candidate/generation、Content Target、Environment root、retained controller、source commit/tree、provider digest与显式授权identity

#### Scenario: Record gate或authority检查失败

- **WHEN** Execution Record容量不足，或Environment、Development、Content Target、checkout ownership、cleanliness、commit/tree任一不匹配
- **THEN** recovery MUST在capsule创建、manifest写入、run mutation与candidate import前停止
- **AND** MUST保留原run与Task Environment现场

### Requirement: Bootstrap capsule必须验证完整provider checkout而非单一导出函数

Capsule MUST把authority manifest保存在可执行`source/`外，并使用detached shared-object checkout固定source commit与tree。每次首次import与resume MUST重新验证source HEAD、tree、cleanliness、provider canonical path/digest及manifest identity。CLI MUST NOT接受caller source/module/manifest/tarball，也MUST NOT使用npm pack/install或candidate CLI。规范与产品输出MUST说明ES module import会执行provider模块及其受验证本地依赖闭包，MUST NOT把命名导出描述为sandbox。

#### Scenario: Capsule依赖发生漂移

- **WHEN** provider入口文件未变但capsule中任一tracked依赖、untracked文件、HEAD或tree发生漂移
- **THEN** recovery MUST在module import与canonical mutation前fail closed
- **AND** MUST保留matching run与可审查diagnostic

#### Scenario: 调用方选择可执行代码

- **WHEN** 调用方提供source、module、manifest、tarball或其他executable selector
- **THEN** recovery MUST零capsule副作用拒绝该输入
- **AND** MUST NOT复制、安装、import或执行该内容

### Requirement: Candidate provider必须只取得最小retained runtime façade

Retained Application MUST只向candidate provider传入当前Task Finish Product phase所需的closed allowlist runtime façade，且MUST继续使用retained Structured Store sourceRoot与repository完成全部canonical mutation。Façade MUST NOT通过prototype或其他fallback暴露完整retained runtime。该限制是最小authority边界，不得被描述为对可信candidate Product代码的通用sandbox。

#### Scenario: Candidate provider参与恢复

- **WHEN** retained Application从已验证capsule创建Product phase handlers
- **THEN** handler runtime MUST只包含声明的Task Finish phase dependencies，bootstrap provenance仍只由retained run持有
- **AND** run transition、resume token、Task Record terminal association与SQLite persistence MUST仍由retained Application/repository执行

### Requirement: Bootstrap recovery必须复用同一run并由retained finalizer清理capsule

合格failed phase MAY只在同一run内重置，并MUST把原run status、primary failure与phase attempt保存在bootstrap provenance。合格blocked run MUST保留current Product resume token。后续blocked phase MUST复用同一capsule与token。Candidate provider cleanup handler MUST NOT删除capsule；cleanup phase持久化passed后，retained finalizer MUST原子撤销精确source authority、持久化可恢复的revocation evidence，再提交terminal SQLite state。

#### Scenario: Failed prepare在原run内重置

- **WHEN** prepare是合格terminal provider failure且closed no-side-effect predicate通过
- **THEN** retained Application MAY把同一phase重置为pending并继续同一run
- **AND** MUST保留原failure provenance
- **AND** MUST NOT创建新run、Candidate、Formal Verification、Completion Review或handoff

#### Scenario: Recovery进入普通blocked phase

- **WHEN** authorized provider在preflight/prepare之后返回可恢复blocked result且source authority仍有效
- **THEN** Product MUST保留同一capsule identity并生成same-run exact resume token
- **AND** matching resume MUST重新验证完整capsule后只继续未通过phase

#### Scenario: 撤销前失败

- **WHEN** cleanup phase尚未持久化passed或source rename失败
- **THEN** 完整source authority与manifest MUST保留供same-run resume
- **AND** MUST NOT把capsule误报为removed

#### Scenario: 撤销过程中进程退出

- **WHEN** source已移动到deterministic quarantine但run cleanup evidence尚未持久化
- **THEN** 外置manifest与quarantine identity MUST允许retained finalizer确定性确认authority已撤销、补写tombstone并继续同一run
- **AND** MUST NOT重新import candidate provider或重放cleanup phase

#### Scenario: Terminal finalize失败

- **WHEN** 全部phase已passed且capsule authority已撤销，但terminal SQLite finalize失败
- **THEN** run MUST保持`cleanup_pending`与current Product resume token
- **AND** resume MUST只重试retained resource/terminal finalizer
- **AND** MUST NOT要求capsule存在、重新import provider或重放已通过phase

#### Scenario: Revoked residual回收失败

- **WHEN** source authority已撤销且quarantine递归回收失败
- **THEN** Result MUST记录inert residual attention
- **AND** MUST NOT阻止已成立的Finish terminal state或重放phase

### Requirement: Bootstrap Result必须提供最小可审查provenance

Bootstrap适用时，canonical Finish Result MUST additive记录retained-writer mode、原failure、source commit/tree、provider digest、capsule identity与cleanup/revocation状态，并把`bootstrapRecoveryExecutions`设为1。`manualRecoveryManifests`与`formalVerificationExecutions` MUST保持0。公开compact projection MUST只暴露恢复判断所需的portable identity与状态，MUST NOT暴露transferable writer credential、完整本机路径或caller-authored evidence。

#### Scenario: Bootstrap run返回current Result

- **WHEN** bootstrap recovery完成、blocked或进入terminal-only resume
- **THEN** full与compact Result MUST从同一canonical run事实确定性投影bootstrap provenance与current next action
- **AND** Result MUST保持同一run、Candidate/generation、Content Target与正常Execution Record边界

### Requirement: Task Finish 必须能释放已放弃任务的未交付隔离载体占用

Task Finish MUST 提供现有 `task finish run` 的显式 `--release-occupancy` 选项，用于释放指定 run 仍占用的隔离载体（Delivery Carrier）。该选项 MUST 要求 `--run <run-id>` 与 `--task <task-id>`，且 Task Record 当前为 `abandoned`。该 run MUST 绑定同一 Task 与 canonical Workspace。Run MUST 尚未形成成功交付：`delivery.status` 不是 `delivered`，且 `remoteAfterRef` 与 `finalRemoteRef` 均为空。满足时 Finish MUST 只删除可证明属于该 run 的 carrier（与成功 cleanup 使用同一 ownership 核验），MUST NOT push、fast-forward、改写远端、调用 `completeTaskRecordFromFinish`，也 MUST NOT 把 abandoned Task 改成 completed。释放成功后 MUST 留下 inspect 可核对的占用已释放事实，并使该 carrier 目录不再存在。

#### Scenario: 已放弃且从未交付时释放占用

- **WHEN** Task 为 `abandoned`，指定 Finish run 仍登记真实非 symlink carrier，且 Result 证明从未成功交付
- **THEN** `task finish run --task <task-id> --run <run-id> --release-occupancy` MUST 删除该 run-owned carrier 并返回占用已释放
- **AND** Task Record MUST 保持 `abandoned`，远端 target MUST 不变

#### Scenario: 已成功交付则拒绝释放

- **WHEN** 指定 run 的 `delivery.status` 为 `delivered`，或 `remoteAfterRef`/`finalRemoteRef` 非空
- **THEN** Finish MUST fail closed 并保留 carrier
- **AND** MUST NOT 删除目录、push、或改写 Task 终态

#### Scenario: 任务仍是 active 则拒绝释放

- **WHEN** `--release-occupancy` 的 Task 不是 `abandoned`
- **THEN** Finish MUST fail closed
- **AND** MUST NOT 把该选项当作普通 resume 或五阶段继续执行

#### Scenario: carrier 所有权不可证明

- **WHEN** carrier 路径缺失、为 symlink、越界，或与 run 登记 identity 不一致
- **THEN** Finish MUST fail closed 并保留现场
- **AND** MUST NOT 扩大删除到 Workspace 根、其他 Task 或其他 run

### Requirement: Preflight 必须观察 retained 与目标远端对齐
`preflight` MUST在创建 Delivery Carrier 或任何 delivery mutation 之前，观察 retained canonical Workspace 当前符号分支与本次 run 绑定的目标远端 ref。观察 MUST复用交付模块既有 Git identity 事实，不得另造检查器，也不得执行 `fetch`、rebase、merge 或 working tree 写入。retained 落后、分叉、detached、脏工作区导致无法证明可快进对齐，或远端 ref 无法观察时，preflight MUST fail closed；prepare、verify、deliver 与 cleanup MUST保持未执行。该失败 MUST NOT登记为新的 `task_finish.entry_gaps` 缺口码。`deliver` 现有 `retained-workspace-not-ready` 检查 MUST继续作为第二道防线。

#### Scenario: retained 已与目标远端对齐
- **WHEN** retained 当前符号分支等于 run 的 target branch，工作区可证明 clean，且 HEAD 等于已观察的远端 target ref
- **THEN** preflight MUST将该对齐观察记为通过
- **AND** MUST继续后续阶段，不得因该观察创建 Git mutation

#### Scenario: retained 落后目标远端
- **WHEN** retained 当前分支可快进到已观察远端 target ref，但 HEAD 不等于该 ref
- **THEN** preflight MUST blocked，code 标识 retained 未对齐
- **AND** MUST零 carrier、lease、push 与 retained activation
- **AND** MUST NOT把该失败写成 `task_finish.entry_gaps`

#### Scenario: retained 与目标远端分叉
- **WHEN** retained HEAD 与远端 target ref 不在可快进祖先关系中
- **THEN** preflight MUST fail closed 并报告 diverged
- **AND** MUST NOT rebase、merge 或改写共享历史

#### Scenario: 远端 target ref 无法观察
- **WHEN** preflight 无法只读观察目标远端当前 ref
- **THEN** preflight MUST fail closed
- **AND** MUST NOT把超时或不可达伪装成已对齐
- **AND** MUST NOT执行 fetch、rebase 或 working tree 写入

### Requirement: Finish run agent 必须来自 Environment adapter
创建 Finish run 时绑定的 Doctor agent MUST等于 matching ready Task Environment Receipt 的 controller adapter。调用方省略 `--agent` 时，产品 MUST使用该 Environment adapter，MUST NOT猜测当前聊天宿主或默认为 Codex。调用方传入 `--agent` 且与 Environment adapter 不一致时，产品 MUST在入口聚合的 `environment` 分类返回既有 mismatch 缺口，MUST NOT创建 run。deliver 执行 retained Doctor 时 MUST使用该冻结 run agent。

#### Scenario: 省略 Finish --agent
- **WHEN** Environment adapter 为 `codex`，调用方运行 `task finish run` 且未提供 `--agent`
- **THEN** 产品 MUST把 run agent 记为 `codex`
- **AND** retained Doctor MUST以 `--agent codex` 执行

#### Scenario: Finish --agent 与 Environment 一致
- **WHEN** Environment adapter 为 `cursor`，调用方传入 `--agent cursor`
- **THEN** 产品 MUST接受该值并冻结为 run agent
- **AND** MUST NOT改写为另一个宿主

#### Scenario: Finish --agent 与 Environment 不一致
- **WHEN** Environment adapter 为 `codex`，调用方传入 `--agent cursor`
- **THEN** 产品 MUST返回 `environment` 入口缺口且不创建 run
- **AND** MUST NOT用聊天宿主执行 Doctor
