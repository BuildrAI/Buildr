## MODIFIED Requirements

### Requirement: Task Environment 必须统一编排安全 cleanup
Task Environment MUST独占Task级环境cleanup编排和结果。正常完成或交付后清理时，它 MUST只在上层提供每个工作范围的已验证delivery identity与清理资格后停止资源、调用provider cleanup并解除占用；delivery evidence MAY来自自动Finish或独立reconciliation。对于隔离或外部交付，Environment MUST把bounded Task Contribution proof交给Git provider复核，而不是要求特定Finish run、Delivery Carrier或原Task branch ancestry。明确放弃时，它 MAY在上层已经处置关联Change/保留事实且ownership可证明后清理Task-owned dirty资源。Task Environment MUST NOT执行commit、merge、push、远端删除、语义交付判断或Retrospective，也 MUST NOT改变Task交付终态。

#### Scenario: 正常完成后清理
- **WHEN** delivery evidence证明全部工作范围已交付且可清理，资源与provider evidence均匹配
- **THEN** Task Environment MUST按资源依赖顺序停止动态资源，再调用各scope provider cleanup并解除共享根占用
- **AND** Environment Receipt MUST保留removed/retained resources、provider results与最终cleanup status

#### Scenario: 隔离carrier交付后清理原Task worktree
- **WHEN** reconciliation提供可独立复算的Task Contribution proof，目标ref完整包含贡献且当前Task source snapshot未漂移
- **THEN** Environment MUST允许Git provider确认integrated并清理原Task worktree/branch
- **AND** MUST不要求交付由Finish Carrier产生或原Task branch成为target祖先

#### Scenario: Finish 请求清理但资源仍阻塞
- **WHEN** 任一资源仍运行、provider identity不匹配、worktree source drift、integrated proof不成立或其他Task仍占用资源
- **THEN** cleanup MUST返回`blocked`或`attention`并保留仍用于恢复的环境内容
- **AND** MUST NOT改写Task Record completed或远端delivery evidence

#### Scenario: 用户明确放弃独占 dirty worktree
- **WHEN** 上层提供明确abandon authorization，关联Change/保留事实已处置，且provider evidence证明dirty worktree全部属于该Task
- **THEN** Task Environment MAY请求provider删除该Task-owned checkout、未共享本地分支与资源
- **AND** MUST记录放弃授权和实际removed evidence，不要求第二次普通cleanup确认

#### Scenario: 放弃共享根但 ownership 不清
- **WHEN** 非Git/shared execution root混有来源不明或其他Task改动
- **THEN** Task Environment MUST保留该内容并返回`blocked`或明确retained result
- **AND** MUST NOT因Task已放弃而清空、回滚或删除整个共享根

#### Scenario: 清理其他并行任务
- **WHEN** 同一Workspace/Git common-dir还存在其他Task receipts、worktrees、previews、ports或branches
- **THEN** cleanup MUST只操作当前Environment Receipt精确登记且provider已证明ownership的资源
- **AND** 其他任务的文件、进程、refs、evidence与receipts MUST保持不变

#### Scenario: 清理成功后的最小留痕
- **WHEN** 全部适用资源已删除或按明确决定安全保留
- **THEN** Buildr MUST在`task_environment_current`保留Task/Workspace identity、完成时间、最终status与最小处置摘要
- **AND** MUST NOT删除Task Record、Development/Review/Verification/delivery Result或Retrospective

### Requirement: Task Finish SQLite completion 必须与 Environment cleanup 幂等交接
Task Environment MUST继续独占Task级资源cleanup；delivery owner MUST在调用Environment cleanup前提供已验证scope identities与carrier/contribution proof。Environment cleanup成功后，自动Finish或Agent MAY继续清理各自owned transient，但Task交付终态不得依赖这些动作。Environment MUST NOT写Finish表，Finish/reconciliation MUST NOT直接删除Environment-owned资源。

#### Scenario: cleanup 前进程退出
- **WHEN** Task已保存逐scope delivery evidence但尚未调用Environment provider
- **THEN** Agent MUST能使用同一delivery evidence启动或恢复Task Environment cleanup
- **AND** MUST NOT重跑远端交付或要求创建Finish run

#### Scenario: Environment cleanup blocked
- **WHEN** Environment因资源运行、identity漂移、ownership不明或其他Task占用而返回blocked
- **THEN** Environment MUST保留精确next action与恢复所需资源
- **AND** Task Record completed与delivery evidence MUST保持不变

#### Scenario: Environment 已 cleaned 后进程退出
- **WHEN** Environment Receipt已证明同一Task cleanup成功，而Finish或Agent尚有自己的transient待处理
- **THEN** 后续恢复 MUST只处理调用方owned剩余动作
- **AND** Environment MUST NOT再次停止资源或调用provider cleanup

#### Scenario: Finish terminal transaction 完成
- **WHEN** Environment cleanup成功且identity匹配
- **THEN** Environment MUST保存最小cleaned留痕并释放其owner资源
- **AND** 该结果 MUST作为Task详情的独立maintenance fact，而不是Task交付终态前置条件
