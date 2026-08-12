## ADDED Requirements

### Requirement: Git Finish 必须区分任务贡献与交付基线
Git-backed Task Finish MUST把任务贡献（Task Contribution）定义为原任务基线 tree 到current Task source snapshot tree的canonical raw Git delta，把交付基线（Delivery Baseline）定义为prepare时读取的最新远端target commit/tree。Task Contribution identity MUST绑定path、mode与before/after blob identities；Delivery Baseline变化 MUST NOT自动改变Development Candidate、generation、Verification Result、Completion Review或handoff。该证明只表达确定性Git应用和identity等价，MUST NOT以路径无重叠、clean apply或其他机械事实推断语义安全。

#### Scenario: 目标分支前进但任务贡献未变
- **WHEN** Candidate freeze后远端target前进，Development handoff与Task Content Target仍current，且原Task Contribution可在最新Delivery Baseline上无冲突应用并得到相同delta identity
- **THEN** Finish MUST复用原Candidate、generation、Verification gate、Completion Review、decision与handoff
- **AND** MUST在结果中分别记录Task Contribution、原任务基线、Delivery Baseline与carrier identities
- **AND** `formalVerificationExecutions` MUST保持`0`

#### Scenario: 机械事实不能证明语义安全
- **WHEN** Buildr只观察到目标变化路径与任务路径不重叠或Git apply成功
- **THEN** Buildr MUST只把这些事实用于机械应用与identity核验
- **AND** MUST NOT声称语义安全、业务验收通过或替代Agent、Project与既有verification policy的判断

#### Scenario: 贡献变化或无法证明
- **WHEN** Task Content Target/handoff漂移、Git应用冲突、原/应用后delta identity不同、baseline或carrier ownership无法证明，或继续需要语义判断
- **THEN** Finish MUST fail closed并返回`nextWorkflow: task-development`
- **AND** MUST NOT自动解决冲突、force push、修改原Task worktree、生成新Candidate或伪造复用evidence

## MODIFIED Requirements

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
Task Finish MUST根据current run、Development handoff、Task Contribution、Delivery Baseline、carrier observations、target ref与retained/cleanup真实状态生成最早可恢复边界和`resumeToken`。Content Target与handoff仍current的短暂target lease、target race、retained或cleanup阻塞 MAY在同一run恢复；target race只有在重新prepare后仍能证明原Task Contribution等价时才能继续复用原Candidate。调用方 MUST NOT提供recovery manifest、Candidate、step fingerprint、execution plan或claimed outcome。

#### Scenario: 目标 ref 前进后的候选恢复
- **WHEN** run在deliver发现`task-finish.target-race`，且调用方提供current product-generated matching resume token
- **THEN** 产品 MUST使旧prepare/verify/deliver/cleanup outputs失效，从prepare读取最新Delivery Baseline并重建隔离carrier
- **AND** Candidate identity/generation、Verification Result、Completion Review、decision与handoff MUST保持不变
- **AND** `formalVerificationExecutions` MUST保持`0`

#### Scenario: target race恢复发现冲突或贡献漂移
- **WHEN** 新Delivery Baseline无法无冲突应用原Task Contribution，或应用后的delta identity不等价
- **THEN** 当前run MUST terminal failed并返回Task Development
- **AND** MUST不再次生成resume token、自动解决冲突或转入旧的重复Candidate路径

#### Scenario: 暂态条件解除
- **WHEN** run因target lease、retained install或cleanup暂态失败，且再次观察证明handoff与适用carrier未变、条件已解除
- **THEN** matching resume token MAY从最早blocked phase继续
- **AND** 已通过的prepare/verify MUST仅在Development Application仍报告current时复用

#### Scenario: 恢复状态无法证明
- **WHEN** 请求无法证明同一handoff、Task Contribution、equivalent carrier与允许的transition
- **THEN** 产品 MUST fail closed并生成具体diagnostic
- **AND** MUST NOT要求Agent猜测或手写recovery JSON

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

### Requirement: Prepare 必须只准备内容等价Delivery Carrier
`prepare` MUST在产品拥有的隔离位置，以最新Delivery Baseline机械形成承载current Development Candidate之Task Contribution的可交付ref。它 MAY使用临时Git index、source snapshot tree、binary patch、detached worktree与carrier commit，但 MUST NOT提交、rebase或改写原Task worktree/index/branch，MUST NOT执行OpenSpec convergence/archive、runtime内容sync、生成资产收敛、语义冲突resolution、Candidate freeze或generation。每个动作后 MUST通过Task Development Application确认原Content Target/handoff current，并证明应用前后Task Contribution identity等价。

#### Scenario: 未提交内容形成carrier commit
- **WHEN** exact Candidate source bytes包含未提交内容，且可从原任务基线生成source snapshot并在最新Delivery Baseline无冲突应用为等价Task Contribution
- **THEN** prepare MUST只在隔离carrier中commit并记录Task Contribution、Delivery Baseline与carrier ref
- **AND** 原Task worktree/index/branch、Development Candidate identity/generation与专业Result MUST保持不变

#### Scenario: 最新基线已前进且贡献等价
- **WHEN** 最新Delivery Baseline不同于原任务基线，但Git应用无冲突且应用后canonical raw delta identity等于原Task Contribution identity
- **THEN** prepare MUST进入verify并复用原handoff
- **AND** MUST不执行formal Verification或Completion Review

#### Scenario: prepare需要改变source bytes
- **WHEN** sync、archive、生成、冲突处理、非等价Git delta或语义判断会改变或无法证明原Task Contribution
- **THEN** prepare MUST删除可证明属于当前run的未交付carrier并返回Task Development
- **AND** 该动作 MUST回到Development执行，Finish MUST不自行重新Verification、Candidate或Completion Review

### Requirement: Verify 必须只证明handoff与carrier等价
`verify` MUST再次通过Task Development Application检查current handoff、Candidate identity与Task context/policy applicability，并重新核验隔离carrier ownership、Delivery Baseline与Task Contribution identity等价。该阶段 MUST NOT调用Task Verification Application、Project verification declaration或`buildr verification run`，MUST NOT读取/写入Verification Result，且`formalVerificationExecutions` MUST始终为0。

#### Scenario: handoff与carrier仍current
- **WHEN** Development Application确认原handoff current，且carrier上的应用delta与原Task Contribution identity完全等价
- **THEN** verify MUST记录passed与handoff/candidate/contribution/baseline/carrier identities
- **AND** MUST不启动任何formal Verification executor或Completion Review

#### Scenario: Verification Result在Finish期间变化
- **WHEN** owner Result或declaration变化导致Development handoff失效
- **THEN** verify MUST按Development Application read model停止并返回`task-development`
- **AND** Finish MUST不直接检查、修复、覆盖或重新执行Verification

#### Scenario: carrier贡献不等价
- **WHEN** carrier path/registration、baseline、source snapshot或应用后delta任一identity不能匹配prepare evidence
- **THEN** verify MUST fail closed并返回Task Development
- **AND** MUST不以changed paths无重叠或Git apply曾成功替代identity proof
