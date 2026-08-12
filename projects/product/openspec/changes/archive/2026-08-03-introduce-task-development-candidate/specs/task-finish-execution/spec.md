## MODIFIED Requirements

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
进入Task Finish的Candidate MUST由Task Development Application生成并通过current handoff交接；该handoff MUST已闭合Content Target、Task context、verification policy、Planning/Verification/Completion gates与proceed decision。Task Finish MUST NOT执行额外Review、formal Verification、risk decision或Candidate generation。任何内容漂移、语义冲突或handoff缺口 MUST退出当前Finish并回到Development。

#### Scenario: Preflight 发现产品缺陷
- **WHEN** Development Application报告Candidate/handoff不再current
- **THEN** run MUST标记terminal `failed`并返回`nextWorkflow: task-development`
- **AND** MUST NOT在Finish中编辑内容、修改decision或补写专业Result

#### Scenario: carrier等价核验失败
- **WHEN** prepare后的carrier Content Target与handoff Candidate不相等
- **THEN** run MUST返回真实component drift与Development handoff
- **AND** MUST NOT在同run重新观察为新Candidate或重跑formal Verification

#### Scenario: 正式保证发现测试失败
- **WHEN** Development handoff缺少current Verification gate、Result为stale/incomplete，或未形成允许推进的Development decision
- **THEN** Finish MUST在preflight返回`nextWorkflow: task-development`
- **AND** MUST NOT在Finish内执行formal Verification、读取Result store或接受风险

### Requirement: Deliver 必须只交付冻结候选
`deliver` MUST在短target lease/fencing边界内重新核对expected target ref，只允许已通过Development equivalence的carrier fast-forward、普通push、retained Workspace convergence与受影响入口安装。Force push、merge commit、远端任务分支push/delete、丢弃改动、target rebase和语义冲突resolution MUST保持未授权。

#### Scenario: 目标 ref 未漂移
- **WHEN** observed target ref等于handoff建立时的expected target ref且carrier仍equivalent
- **THEN** deliver MUST完成明确ref transition、普通push与retained convergence
- **AND** result MUST记录before/carrier/after remote ref与Candidate identity

#### Scenario: 目标 ref 外部前进
- **WHEN** push前observed target ref不再等于expected target ref
- **THEN** deliver MUST释放lease并返回Development workflow handoff
- **AND** MUST NOT在当前run rebase、重建Candidate、重跑formal Verification、force push或自行解决内容冲突

#### Scenario: Retained 入口受影响
- **WHEN** Development Candidate改变runtime、默认CLI或Local App的正式影响路径
- **THEN** deliver MUST使用receipt-bound retained root、CLI与Node identity执行相应doctor/sync/install
- **AND** 未受影响入口 MUST记录not-applicable reason而不执行安装

### Requirement: Resume 必须由产品根据真实状态生成
Task Finish MUST根据current run、Development handoff、carrier observations、target ref与retained/cleanup真实状态生成最早可恢复边界和`resumeToken`。只有Content Target与handoff仍current的短暂target lease、retained或cleanup阻塞 MAY在同一run恢复；任何target race MUST终止run并返回Development，因为Finish不能证明新的target transition仍适用于原Verification/Candidate。调用方 MUST NOT提供recovery manifest、Candidate、step fingerprint、execution plan或claimed outcome。

#### Scenario: 目标 ref 前进后的候选恢复
- **WHEN** run在deliver发现target race且保持旧handoff
- **THEN** 产品 MUST终止当前run并返回Task Development重新建立stable Content Target、Verification、Candidate、Completion Review与handoff
- **AND** MUST不生成resume token，不得从prepare恢复、rebase carrier或复用旧Candidate

#### Scenario: 暂态条件解除
- **WHEN** run因target lease、retained install或cleanup暂态失败，且再次观察证明handoff与carrier未变、条件已解除
- **THEN** matching resume token MAY从最早blocked phase继续
- **AND** 已通过的prepare/verify MUST仅在Development Application仍报告current时复用

#### Scenario: 恢复状态无法证明
- **WHEN** 请求无法证明同一handoff、equivalent carrier与允许的transient transition
- **THEN** 产品 MUST fail closed并生成具体diagnostic
- **AND** MUST NOT要求Agent猜测或手写recovery JSON

### Requirement: Current run 与结果必须直接表达阶段、失败和效率
Canonical Task Finish MUST以现有run store的一次性breaking schema迁移写入`buildr.task-finish-run/v2`并返回compact `buildr.task-finish-result/v2`，MUST拒绝恢复旧v1 run且MUST NOT新建第二个Finish Receipt authority。结果 MUST包含Task、Development handoff、Candidate/Content Target、carrier/target identity、五阶段状态与timing、current primary failure、bounded diagnostic、resume/development workflow、固定为0的formal verification execution count、product command observations、CLI invocation count、Agent provider completion count、manual recovery count、wall-clock coverage和cleanup/completion。Full detail MUST通过有界digest绑定引用提供，MUST不投射Finish-owned change kind、Candidate generation或verification authority。

#### Scenario: 正常路径完成
- **WHEN** 五阶段全部成功或not-applicable
- **THEN** result MUST报告`status: complete`、durable completion和全部效率字段
- **AND** MUST明确`formalVerificationExecutions: 0`、`agentProviderCompletions: 0`与`manualRecoveryManifests: 0`

#### Scenario: 中途失败
- **WHEN** 任一阶段blocked或failed
- **THEN** compact result MUST直接包含phase、operation/check、code/status/exit、diagnostic identity和唯一next workflow/action
- **AND** 已解决的历史失败 MUST NOT继续作为current primary failure

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

## REMOVED Requirements

### Requirement: Prepare 必须收敛并冻结唯一候选
**Reason**: P0.5将内容收敛、formal Verification与Candidate freeze迁移到Task Development；Finish prepare只允许机械准备内容等价Delivery Carrier。

**Migration**: 使用新的“Prepare 必须只准备内容等价Delivery Carrier” Requirement。

### Requirement: Verify 必须对冻结候选最多执行一次正式保证
**Reason**: Formal Verification必须在Candidate freeze之前绑定stable Content Target；Finish verify不得执行或拥有Verification。

**Migration**: 使用新的“Verify 必须只证明handoff与carrier等价” Requirement。

### Requirement: Code-only run 必须明确记录 Change 动作不适用
**Reason**: Change context由Development handoff闭合并对Finish保持opaque；无Change run不应重新拥有Change分类或not-applicable占位。

**Migration**: 使用新的“Code-only run 必须完全省略Change authority” Requirement。

## ADDED Requirements

### Requirement: Prepare 必须只准备内容等价Delivery Carrier
`prepare` MAY完成把Development Candidate承载为可交付ref所需的确定性机械动作，例如exact source staging与candidate commit，但MUST NOT执行OpenSpec convergence/archive、runtime内容sync、生成资产收敛、语义冲突resolution、target rebase、Candidate freeze或generation。每个动作后 MUST通过Task Development Application重观测carrier；只有complete Content Target逐component等于handoff Candidate时才能继续。

#### Scenario: 未提交内容形成carrier commit
- **WHEN** exact Candidate source bytes被机械提交且commit前后Content Target等价
- **THEN** prepare MUST记录carrier ref并进入verify
- **AND** Development Candidate identity/generation MUST保持不变

#### Scenario: prepare需要改变source bytes
- **WHEN** sync、archive、生成、rebase或冲突处理会改变任一Content Target component
- **THEN** prepare MUST停止并返回`carrier-content-changed`
- **AND** 该动作 MUST回到Development执行、重新Verification、Candidate与Completion Review

### Requirement: Verify 必须只证明handoff与carrier等价
`verify` MUST再次通过Task Development Application检查current handoff、Candidate identity、Task context/policy applicability与carrier Content Target equivalence。该阶段 MUST NOT调用Task Verification Application、Project verification declaration或`buildr verification run`，MUST NOT读取/写入Verification Result，且`formalVerificationExecutions` MUST始终为0。

#### Scenario: handoff与carrier仍current
- **WHEN** Development Application确认handoff current且carrier与Candidate Content Target完全等价
- **THEN** verify MUST记录passed与handoff/candidate/carrier identities
- **AND** MUST不启动任何formal Verification executor

#### Scenario: Verification Result在Finish期间变化
- **WHEN** owner Result或declaration变化导致Development handoff失效
- **THEN** verify MUST按Development Application read model停止并返回`task-development`
- **AND** Finish MUST不直接检查、修复、覆盖或重新执行Verification

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
