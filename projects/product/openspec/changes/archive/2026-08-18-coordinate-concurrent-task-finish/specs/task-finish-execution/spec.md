## ADDED Requirements

### Requirement: Delivery Carrier 准备不得被共享 target 占用全局串行化
Task Finish MUST只在`deliver`的共享target mutation临界区获取target lease。`preflight`、`prepare`、`verify`、run-owned carrier创建与Delivery Adaptation MUST不因另一个Task持有相同`remote + targetBranch`的lease而停止；它们 MUST继续保持各自Task/handoff/Candidate/Content Target与carrier ownership隔离。只有当前run进入`deliver`且lease仍由另一owner持有时，Product才 MUST返回同run可恢复的target occupied诊断。

#### Scenario: 另一个 Task 正在交付同一 target
- **WHEN** Task A 已持有`origin:dev` target lease，而Task B的current handoff可独立建立Delivery Carrier
- **THEN** Task B MUST仍可完成carrier preparation与equivalence verify
- **AND** Task B MUST只在进入deliver时等待target lease，不得要求Task A先完成self-bootstrap、Doctor或cleanup才创建carrier

#### Scenario: 不同 target 并行交付
- **WHEN** 两个Task绑定不同的`remote + targetBranch` identity
- **THEN** 两个run的deliver lease MUST互不阻塞
- **AND** Product MUST不建立Workspace全局Finish锁或carrier队列

### Requirement: Delivery Adaptation 必须返回可直接执行的 blocked-only guidance
当current run精确因`task-finish.delivery-adaptation-required`停止时，canonical full Result与compact投影 MUST返回同一`deliveryAdaptation` guidance。guidance MUST包含run-owned完整规范化`expectedCommitMessage`以及从current Task Environment Preparation Plan派生的required `preparationHints`。每个hint MUST只含scope/recipe/step identity、相对Environment root的cwd和适用executable、声明args、timeout及预期outputs；MUST NOT包含环境变量、secret、命令输出或Task worktree绝对路径。Agent MUST把相对路径映射到matching run-owned carrier，完成语义适配和依赖准备后以exact message形成carrier HEAD。

该guidance MUST只在当前Delivery Adaptation恢复窗口出现。failure解除、其他blocked状态、terminal Result、Execution Record、Task Record、Development Receipt与Environment Receipt MUST不复制完整message；完整message的持久authority仍为Task Finish current run。

#### Scenario: Git conflict 首次返回适配指导
- **WHEN** prepare机械应用冲突并形成matching run-owned baseline carrier与resume token
- **THEN** compact和full Result MUST同时返回包含`Buildr-Task: <task-id>` trailer的exact expected commit message
- **AND** MUST返回可在carrier root重放的required Preparation hints，使Agent无需先做一次错误commit或读取第二authority

#### Scenario: Preparation hint 不能安全移植
- **WHEN** current Preparation step的cwd、executable、args或output无法约束为受控相对路径/声明值
- **THEN** Product MUST省略该不安全step并在guidance中报告bounded unavailable reason
- **AND** MUST NOT投影原Task worktree绝对路径、process env或猜测替代命令

#### Scenario: 适配窗口结束
- **WHEN** same run已通过prepare或进入complete/cleanup_pending/其他blocked状态
- **THEN** 公开Result与Execution Record MUST恢复为只投影commit subject和message identity
- **AND** MUST不把先前完整message或Preparation hints保留为terminal常驻事实

## MODIFIED Requirements

### Requirement: Deliver 必须只交付冻结候选
`deliver` MUST在短target lease/fencing边界内重新核对Delivery Carrier绑定的expected target ref，只允许已通过Development handoff current与Task Contribution equivalence的carrier fast-forward、普通push、retained Workspace convergence与受影响入口安装。Product adapter MUST在创建Git-backed run时从retained checkout当前符号分支解析默认target branch；显式target branch MUST与该当前分支一致。Task Environment checkout `startPoint` MUST只作为环境来源证据，不得直接充当交付分支identity。Product adapter MUST为每个Git-backed Finish run绑定retained checkout中真实配置的delivery remote；当Environment repository因`source.type: workspace`没有声明remote时，MUST从target branch upstream或唯一配置的remote确定性解析，无法解析或存在歧义时 MUST在创建run和delivery mutation前fail closed。普通push成功后 MUST以固定小次数重新读取远端target ref；每次非零观察 MUST记录独立operation evidence，且不得重复push。只有真实回读值等于carrier ref时才能记录`remoteAfterRef`、报告`delivered`并进入cleanup。任一次成功回读但ref不一致 MUST立即进入既有target-race/containment判断，不得以重试等待ref变成期望值；全部观察持续失败 MUST保留同一run/carrier恢复事实。Force push、merge commit、远端任务分支push/delete、丢弃改动、原Task worktree rebase和语义冲突resolution MUST保持未授权。

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
- **WHEN** 普通push返回成功且第一次远端target ref回读值等于carrier ref
- **THEN** deliver MUST以该真实回读值记录`remoteAfterRef`并继续retained convergence
- **AND** `delivered` MUST只在后续适用动作也成功后成立

#### Scenario: Push 后远端回读暂态失败后成功
- **WHEN** 普通push成功，前序有限次数`ls-remote`非零，但后续允许次数回读值等于carrier ref
- **THEN** deliver MUST保留全部观察evidence并继续，不得再次push
- **AND** MUST把最后真实回读值作为`remoteAfterRef`

#### Scenario: Push 后远端回读失败或不一致
- **WHEN** 普通push后全部有限观察均无法读取远端target ref，或任一次成功回读值不等于carrier ref
- **THEN** deliver MUST停止且不得形成远端完成证据或进入cleanup
- **AND** 持续不可读 MUST保留同一carrier的deliver恢复点；回读不一致 MUST进入既有target-race/containment判断而不得重复readback等待

#### Scenario: 目标 ref 外部前进
- **WHEN** push前observed target ref不再等于Delivery Carrier的Delivery Baseline ref
- **THEN** deliver MUST释放lease并返回带产品生成精确token的resumable `task-finish.target-race`
- **AND** recovery MUST只重做隔离carrier的`prepare → verify → deliver → cleanup`，不得重建Candidate、重跑formal Verification、force push或自行解决内容冲突

#### Scenario: Retained 入口受影响
- **WHEN** Development Candidate改变runtime、默认CLI或Buildr Web的正式影响路径
- **THEN** deliver MUST使用receipt-bound retained root、CLI与Node identity执行相应doctor/sync/install
- **AND** 未受影响入口 MUST记录not-applicable reason而不执行安装

### Requirement: Task Finish 必须冻结有语义的交付提交信息
首次创建 Git-backed Task Finish run 时，Buildr MUST 要求 Agent 提供符合当前 Workspace、Project、Service 与 repository 约定的完整交付提交信息，并 MUST 在任何 Finish current、Delivery Carrier 或 target 副作用前完成规范化与校验。产品 MUST NOT 根据 Task ID、Change ID、diff、文件路径或内部 lifecycle facts自动推断 `type`、`scope` 或主题，也 MUST NOT继续为新run生成“交付 + Task ID”的占位主题。

规范化后的提交信息 MUST 包含非空 subject，MUST 将当前 Task ID 保存为 `Buildr-Task` trailer，并 MUST以稳定identity绑定到同一逻辑run。完整message只能由Task Finish owner作为恢复事实持有并写入实际Git commit；Task Record、Development Receipt、Environment Receipt与其他authority MUST NOT复制正文。公开Finish Result通常 MUST只返回subject与message identity；唯一例外是current run精确处于Delivery Adaptation required恢复窗口时，compact/full Result MUST通过blocked-only `deliveryAdaptation.expectedCommitMessage`返回同一完整message，且状态解除后 MUST停止投影。

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
- **WHEN** Finish run已冻结包含subject与body的完整message且不处于Delivery Adaptation required恢复窗口
- **THEN** Task Finish current run MAY保存恢复所需的完整规范化message
- **AND**公开Result与Execution Record MUST只投影subject和message identity，不得复制完整body或建立第二writer

#### Scenario: Delivery Adaptation 恢复窗口按需投影正文
- **WHEN** current run精确因`task-finish.delivery-adaptation-required` blocked并持有matching carrier与resume token
- **THEN** compact/full Result MUST在blocked-only guidance中投影run-owned exact message
- **AND** Execution Record及其他authority MUST仍只保留subject/identity或摘要，terminal Result MUST不保留正文
