
## ADDED Requirements

### Requirement: 直接完成任务必须能按当前事实安全清理
已完成任务的环境清理 MUST不要求旧收尾运行或交接。Git 提供者 MUST核验工作树和分支所有权、未保存内容以及任务提交被保留仓库当前非任务分支持有；这些事实仅证明删除安全，不证明远端交付。其他资源仍由各自所有者清理。

#### Scenario: 无旧收尾证据
- **WHEN** 任务 completed 且干净受管工作树提交被保留分支持有
- **THEN** 清理 MUST独立完成，不读取研发候选或要求远端再交付。

#### Scenario: 内容未被保留
- **WHEN** 工作树脏、有独有提交、身份不符或保留仓库仍在任务分支
- **THEN** 清理 MUST保留对应内容并报告原因，不改写任务终态。

#### Scenario: 多仓库
- **WHEN** 环境含多个独立仓库
- **THEN** 删除前 MUST逐仓核验包含关系和嵌套资源，任一未知不得误删其他工作。

#### Scenario: 已清理重试
- **WHEN** 环境已经清理成功
- **THEN** 重试 MUST返回既有 cleaned，不重新删除或交付。

## MODIFIED Requirements

### Requirement: Completed no-change Task 必须可受控清理 Environment
Task Environment MUST仅从current Task Record的`completed + noChange=true`终态派生no-change cleanup资格，并 MUST要求Git provider独立证明checkout干净且当前HEAD精确等于Environment evidence冻结的HEAD。Task Record声明 MUST NOT授权删除Environment建立后的新增提交或dirty内容；普通`completed + noChange=false` Task MUST由Git提供者重新核验保留分支包含关系，不要求旧交付记录。

#### Scenario: 无代码协调Task完成后清理
- **WHEN** current Task Record为`completed + noChange=true`，checkout保持干净且HEAD等于Environment provider evidence冻结的HEAD
- **THEN** Task Environment MUST允许provider清理Task worktree、任务分支与受控资源，不要求伪造Delivery或Finish evidence
- **AND** Environment Receipt MUST记录最终cleaned状态与实际cleanup effects

#### Scenario: no-change checkout 包含 dirty 内容
- **WHEN** current Task Record为`completed + noChange=true`但checkout存在staged、unstaged或untracked内容
- **THEN** Git provider MUST拒绝cleanup并保留checkout、任务分支与provider evidence

#### Scenario: no-change checkout HEAD 已漂移
- **WHEN** current Task Record为`completed + noChange=true`但checkout HEAD不等于Environment evidence冻结的HEAD
- **THEN** Git provider MUST以明确HEAD drift诊断拒绝cleanup并保留现场

#### Scenario: 普通completed Task缺少交付证明
- **WHEN** current Task Record为`completed + noChange=false`且没有可复核Delivery evidence
- **THEN** Task Environment MUST交由Git提供者检查真实包含关系，只有身份和内容保全成立才清理；不得把completed状态当作integrated proof


### Requirement: Task Environment 必须统一编排安全 cleanup
本条旧交接和交付证明要求仅约束显式使用旧收尾执行器的路径。默认直接收尾 MUST采用本次新增的独立任务完成与内容保全要求，不得补造旧运行或交接。

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

### Requirement: Environment cleanup 必须消费可重建的已交付贡献证明
本条旧交接和交付证明要求仅约束显式使用旧收尾执行器的路径。默认直接收尾 MUST采用本次新增的独立任务完成与内容保全要求，不得补造旧运行或交接。

Task Environment MUST允许已完成的自动Finish或Delivery Reconciliation提供从冻结Task Contribution、当前Task checkout、delivery carrier/target Git objects与remote containment重建的cleanup proof。旧run缺少新投影字段时，只要provider能独立复算Task source tree、贡献identity与delivered target等价，MUST允许清理精确Task-owned worktree、branch与provider evidence；任一source drift、未知path、remote不包含或identity不匹配仍 MUST fail closed。

#### Scenario: 隔离carrier交付后的历史Task worktree
- **WHEN** Task worktree仍停在原baseline并包含完整dirty Task Contribution，remote target包含matching delivered carrier，且provider独立复算source tree与贡献identity完全相等
- **THEN** Environment cleanup MUST将该checkout视为integrated并清理精确Task-owned worktree、branch和provider evidence

#### Scenario: 历史proof不可重建
- **WHEN** Task source、baseline、carrier、target ref或贡献identity任一缺失、漂移或不匹配
- **THEN** Environment cleanup MUST保留现场并返回精确不匹配诊断，MUST NOT通过Task completed或调用方claimed success放行
