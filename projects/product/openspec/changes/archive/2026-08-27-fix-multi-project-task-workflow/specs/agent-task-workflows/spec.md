## ADDED Requirements

### Requirement: task-triage 必须在正式 Task 创建前收敛逐repository权威基线
当 `task-triage` 已确认进入正式持久交付且需要创建新 Task Record 时，Agent MUST 在调用 Task Record `create` 前解析完整 repository set，并为每个repository从Project/Service registry声明、当前branch/upstream或用户明确选择中取得唯一integration branch与remote。Agent MUST通过selected `buildr.git-operations/v1` provider将每个clean local integration branch收敛到本次fetch后的matching remote ref。只有全部仓库成功且适用的Workspace transition check已ready时才能创建Task；Task Record Application与Task Environment MUST NOT因此获得Git mutation authority。

#### Scenario: 不同repository使用不同integration branch
- **WHEN** Workspace与两个Service repository分别声明`dev`、`dev-pigs`与`dev-nm`及各自matching upstream
- **THEN** task-triage MUST逐repository核对并使用声明的local/remote refs执行fetch与适用rebase
- **AND** MUST不要求全部repository切换为`dev/origin/dev`

#### Scenario: 全部仓库已对齐或成功收敛
- **WHEN** 完整repository set均处于各自clean integration branch、upstream匹配权威remote ref，且fetch与适用rebase全部成功
- **THEN** task-triage MUST核对每个仓库的before/after branch、HEAD与实际effects
- **AND** MUST仅在适用的Workspace transition check ready后调用selected Task Record provider的`create`

#### Scenario: 本地未push commit与远端同时前进
- **WHEN** 仓库clean、本地integration branch含未push且未共享的commit，并且fetch后matching remote ref已前进
- **THEN** task-triage MUST将repository、`rebase` operation、local branch与matching remote ref明确交给selected Git Operations provider
- **AND** rebase成功后 MUST以新的local commit identity继续创建前门禁

#### Scenario: repository目标无法唯一解析
- **WHEN** registry、当前branch/upstream与用户选择无法形成唯一integration branch或remote/ref
- **THEN** task-triage MUST在该repository tree/history零写入状态阻塞Task创建并报告冲突来源
- **AND** MUST NOT猜测`dev`、自动checkout、stash、merge、force push或改变策略

#### Scenario: repository前置事实不满足
- **WHEN** 任一仓库不在已解析的符号integration branch、upstream不匹配、working tree/index dirty、存在进行中的Git operation，或remote/ref/共享风险无法证明
- **THEN** task-triage MUST在该仓库tree/history零写入状态阻塞Task创建并报告当前事实
- **AND** MUST NOT自动checkout、stash/autostash、merge、force push、选择其他分支或改变策略

#### Scenario: fetch或rebase失败
- **WHEN** 任一仓库fetch失败、remote/ref漂移、rebase失败或出现冲突
- **THEN** task-triage MUST不调用Task Record `create`，并报告全部仓库已经发生的effects与当前Git facts
- **AND** MUST NOT把多仓库部分成功报告为零变化或原子回滚

#### Scenario: clean pre-state的rebase冲突可恢复
- **WHEN** rebase在已证明clean的仓库发生冲突，且`rebase --abort`能恢复精确pre-rebase branch、HEAD与clean状态
- **THEN** selected Git Operation MUST报告conflict与recovered abort effects，Task创建仍 MUST blocked
- **AND** abort无法完成或恢复identity无法证明时 MUST保留并报告真实冲突现场

#### Scenario: Git Operations provider不可用
- **WHEN** 新正式Task创建分支无法解析ready `buildr.git-operations/v1` selected provider
- **THEN** task-triage MUST只阻塞Git基线收敛与Task Record create
- **AND** 纯讨论、只读探索、已有Task inspect和不依赖该动作的语义判断 MUST保持可用

## REMOVED Requirements

### Requirement: task-triage 必须在正式 Task 创建前收敛统一 dev 基线

**Reason**: 统一`dev/origin/dev`假设会阻塞使用不同integration branch的合法多repository Task，且与Project/Service registry中的repository authority冲突。

**Migration**: 使用新增的“task-triage 必须在正式 Task 创建前收敛逐repository权威基线”，逐repository解析integration branch、remote与matching upstream。

#### Scenario: 多repository不再统一使用dev
- **WHEN** 正式Task的repository set包含声明非`dev` integration branch的Service repository
- **THEN** Agent MUST迁移到逐repository权威基线Requirement
- **AND** MUST不继续执行统一`dev/origin/dev`门禁
