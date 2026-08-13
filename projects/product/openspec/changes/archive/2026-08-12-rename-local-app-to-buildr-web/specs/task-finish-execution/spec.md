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
- **WHEN** Development Candidate改变runtime、默认CLI或Buildr Web的正式影响路径
- **THEN** deliver MUST使用receipt-bound retained root、CLI与Node identity执行相应doctor/sync/install
- **AND** 未受影响入口 MUST记录not-applicable reason而不执行安装

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
