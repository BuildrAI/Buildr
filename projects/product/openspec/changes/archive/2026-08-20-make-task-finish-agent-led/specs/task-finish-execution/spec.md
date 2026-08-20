## ADDED Requirements

### Requirement: Task Finish 必须支持 Agent 主导的交付收敛
Buildr MUST提供不依赖既有Finish run或Delivery Carrier的交付收敛入口。该入口 MUST从current Development handoff取得Task Contribution，并按Environment repository selector核对明确remote、target branch、真实远端ref与贡献包含关系；事实成立时 MUST保存与自动Finish相同的逐repository delivery evidence并通过Task Record Application提交交付终态。调用方声明、commit message、run token或“由Buildr执行” MUST NOT替代远端观察。

#### Scenario: Agent 已通过其他合法路径交付
- **WHEN** Agent使用Git Operations、PR或其他已授权路径把current Task Contribution交付到明确目标，并调用交付收敛
- **THEN** Buildr MUST从远端重建每个repository的包含证明并登记delivered
- **AND** MUST NOT要求重新执行固定五阶段、创建Delivery Carrier或重复push

#### Scenario: 远端不包含任务贡献
- **WHEN** 任一applicable repository的目标ref不包含current Task Contribution或目标identity有歧义
- **THEN** Buildr MUST只拒绝该repository的交付登记和依赖它的Task终态
- **AND** MUST返回可供Agent处理的实际refs、changed paths和唯一危险动作边界

### Requirement: 交付、激活、清理和诊断必须正交表达
Task Finish Result与terminal projection MUST分别表达代码交付、retained activation、Task Environment cleanup和diagnostics retention。全部applicable repositories交付成立后，Doctor、Environment cleanup、Finish transient cleanup或execution record attention MUST NOT撤销delivered事实或阻止Task交付终态、复盘及无关工作；各owner仍 MUST阻止自身无法安全执行的激活或删除动作。

#### Scenario: 代码已交付但Doctor失败
- **WHEN** 远端交付已证明而retained Doctor未ready
- **THEN** Task MUST保持delivered/completed，activation MUST记录attention并交给Agent处理
- **AND** Buildr MUST NOT把代码交付重新报告为blocked或要求重复push

#### Scenario: 代码已交付但Environment cleanup阻塞
- **WHEN** cleanup因未知dirty内容、资源仍运行或ownership无法证明而停止
- **THEN** Environment cleanup MUST保持pending/attention并保留资源
- **AND** Task交付终态、其他repository与任务复盘 MUST继续可用

### Requirement: 多仓库续跑必须原子保存目标关系与证明
每个已交付repository在续跑或reconciliation时 MUST根据真实远端ref保持或更新目标关系。远端ref等于carrier ref时 MUST保持`carrier`且不得要求containment proof；只有远端后继完整包含carrier及其changed-path after state时，MUST原子保存`already-contained`和完整proof。Buildr MUST NOT保存`already-contained`且proof缺失的状态。

#### Scenario: 已交付仓库远端未变化
- **WHEN** 多仓库run恢复时repository A的远端ref仍等于已保存carrier ref
- **THEN** repository A MUST保持`carrier`关系并复用远端回读事实
- **AND** 后续repository交付和cleanup MUST不因缺少不适用的containment proof而阻塞

#### Scenario: 已交付仓库远端线性前进
- **WHEN** repository A的远端ref已前进且完整保持carrier ancestry与changed paths
- **THEN** Buildr MUST在一次checkpoint中保存`already-contained`、最新final ref和完整containment proof
- **AND** cleanup MUST能从Git重新计算并验证同一proof

## REMOVED Requirements

### Requirement: Task Finish 必须是固定五阶段执行器
**Reason**: 固定五阶段可以保留为自动provider内部实现，但不能继续作为Agent完成交付和登记结果的唯一合法路径。
**Migration**: `task finish run`继续支持自动路径；外部或Agent主导交付使用结果收敛入口。

#### Scenario: 正常候选进入收尾
- **WHEN** 调用方对Development Application提供的current finish handoff执行交付
- **THEN** 产品 MUST允许自动Finish或Agent选择的其他已授权路径形成同一delivery result
- **AND** MUST NOT要求所有交付都经过固定五阶段

#### Scenario: 固定阶段内包含多个机械动作
- **WHEN** 自动Finish provider的prepare或deliver需要多个确定性动作
- **THEN** provider MAY继续把动作记录为内部operations/observations
- **AND** 这些内部阶段 MUST NOT限制Agent选择其他合法交付路径

### Requirement: delivered 必须由完整 Finish 事实 fail closed 派生
**Reason**: 旧要求把远端交付与Doctor、Environment cleanup和Finish内部事实绑定，导致内部故障否定权威Git事实。
**Migration**: delivered只由current Task Contribution、明确目标和真实远端包含关系派生；其他事实进入独立maintenance projection。

#### Scenario: 完整匹配的成功交付
- **WHEN** 全部applicable repository的current Task Contribution、目标identity与远端包含关系完整匹配
- **THEN** projection MUST返回delivered、逐repository final remote ref与交付时间
- **AND** activation、cleanup与diagnostics MUST作为独立事实返回

#### Scenario: 任一关键 identity 不匹配
- **WHEN** Task、handoff、Task Contribution、target或remote ref任一关键identity不匹配
- **THEN** projection MUST把对应repository报告为unproven
- **AND** MUST NOT显示该repository delivered

### Requirement: Task Finish 必须在完整成功后提交顶层 Task 终态
**Reason**: Task交付终态不应依赖后续激活、环境和诊断清理全部成功。
**Migration**: 全部repository交付成立后提交Task终态，激活和清理由各自owner继续处理。

#### Scenario: 完整收尾后自动完成 Task
- **WHEN** 自动Finish证明全部applicable repositories交付成立
- **THEN** delivery reconciler MUST通过Task Record Application写入`completed/noChange=false`
- **AND** 后续maintenance MAY继续执行或独立恢复

#### Scenario: 收尾阻塞不改变 Task
- **WHEN** delivery尚未全部证明，或Task Record Application提交失败
- **THEN** MUST NOT把active Task冒充为completed
- **AND** MUST保留可恢复事实与primary failure

#### Scenario: 已完成 Task 的幂等恢复
- **WHEN** 自动Finish或reconciliation观察到同一Task已是`completed/noChange=false`
- **THEN** Task Record Application MUST返回幂等成功且不产生重复mutation effect
- **AND** maintenance owner MAY继续处理自身pending动作

#### Scenario: 冲突终态阻止 Finish 完成
- **WHEN** 提交交付终态时Task已是`completed/noChange=true`或`abandoned`
- **THEN** Task Record Application MUST保留原终态并返回冲突
- **AND** delivery owner MUST NOT覆盖该终态

### Requirement: Task Finish execution 必须由 record open gate 启动
**Reason**: diagnostics容量或持久化是Buildr内部可观测性问题，不构成阻止已授权安全交付的具体伤害。
**Migration**: producer尽力open/seal record，失败形成attention并保留最小inline facts。

#### Scenario: record capacity backpressure
- **WHEN** diagnostics reservation因Task/owner或Workspace quota被拒绝
- **THEN** producer MUST报告diagnostics attention
- **AND** 满足安全边界的交付或收敛 MUST继续执行

#### Scenario: open成功后首次执行
- **WHEN** invocation通过校验且record open成功
- **THEN** Application MAY建立diagnostics transient并执行所选交付或收敛路径
- **AND** record MUST只承担可观测性与retention

#### Scenario: invalid resume token
- **WHEN** caller对既有自动Finish run提供缺失、不匹配或过期token
- **THEN** Application MUST拒绝该run的受控恢复并保持其资源不变
- **AND** Agent仍 MAY选择不依赖该run的合法外部交付并调用reconciliation
