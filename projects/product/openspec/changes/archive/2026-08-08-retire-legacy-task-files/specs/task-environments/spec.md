## MODIFIED Requirements

### Requirement: Environment restore 必须按 Task ID 串行复核真实事实
Task Environment MUST 通过 canonical Task ID 从 Workspace SQLite 恢复同一份 Environment Receipt，并 MUST 重新探测执行根、provider、Runtime/CLI、依赖、projection 与动态资源。恢复 MUST NOT 按 cwd、branch、相同 HEAD、Agent session 或旧文件猜测 ownership；第一版 MUST 按同一 Task 单一 active writer 处理，发现可见并发或漂移时 fail closed。

#### Scenario: 新 Agent session 恢复 active Task
- **WHEN** Task Manager 已按 Task ID 恢复 active Task 顶层事实，随后请求 Environment restore
- **THEN** Task Environment MUST 定位 `task_environment_current` 中的 current row 并返回同一环境 identity
- **AND** MUST 在返回 `ready` 前重新执行最小真实 probe

#### Scenario: 从 task worktree 内恢复
- **WHEN** 请求 cwd 位于已登记 worktree，但调用方提供匹配 Task ID 和 canonical Workspace
- **THEN** Environment MUST 通过 SQLite Receipt 与 provider evidence 核对 membership 后返回执行 binding
- **AND** MUST NOT 把 cwd 或分支名本身当作 ownership 证明

#### Scenario: receipt 与实际环境漂移
- **WHEN** execution root、provider checkout、Runtime/CLI、lockfile/依赖、projection 或资源事实不再匹配
- **THEN** Environment MUST 返回 `blocked`、精确差异和可确定的恢复/清理动作
- **AND** MUST NOT 静默改写 plan、创建第二份 checkout 或沿用旧 `ready`

#### Scenario: 同一 Task 出现其他 writer 效果
- **WHEN** Agent 观察到 receipt/资源已不同于其读取依据，或同一 Task 正由其他 writer 推进
- **THEN** 当前 Environment mutation MUST 停止并返回 `blocked`
- **AND** MUST NOT 自动 merge、覆盖或宣称锁/CAS/租约保证

### Requirement: Task Environment 必须统一编排安全 cleanup
Task Environment MUST独占Task级环境cleanup编排和结果。正常完成时，它 MUST只在Task Finish提供每个工作范围的已交付identity与清理资格后停止资源、调用provider cleanup并解除占用；对于隔离Delivery Carrier，Environment MUST把bounded Task Contribution proof交给Git provider复核，而不是要求Finish改写原Task branch以制造ancestor关系。明确放弃时，它 MAY在上层已经处置关联Change/保留事实且ownership可证明后清理Task-owned dirty资源。Task Environment MUST NOT执行commit、merge、push、远端删除、语义交付判断或Retrospective。

#### Scenario: 正常完成后清理
- **WHEN** Finish handoff证明全部工作范围已交付且可清理，资源与provider evidence均匹配
- **THEN** Task Environment MUST按资源依赖顺序停止动态资源，再调用各scope provider cleanup并解除共享根占用
- **AND** Environment Receipt MUST保留removed/retained resources、provider results与最终cleanup status

#### Scenario: 隔离carrier交付后清理原Task worktree
- **WHEN** Finish提供可独立复算的Task Contribution proof，target ref等于carrier，且当前Task source snapshot未漂移
- **THEN** Environment MUST允许Git provider以该等价proof确认integrated并清理原Task worktree/branch
- **AND** MUST不要求原Task branch成为target祖先或修改Candidate generation

#### Scenario: Finish 请求清理但资源仍阻塞
- **WHEN** 任一Preview/process/container仍运行、provider identity不匹配、worktree source drift、integrated/contribution proof不成立或其他Task仍占用资源
- **THEN** cleanup MUST返回`blocked`并保留所有仍用于恢复的环境与carrier内容
- **AND** Finish MUST只恢复cleanup，不得重跑prepare、verify或deliver

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
- **THEN** Buildr MUST在 `task_environment_current` 保留Task/Workspace identity、完成时间、最终status与最小处置摘要
- **AND** MUST NOT删除Task Record、Development/Review/Verification/Finish Result或Retrospective

## REMOVED Requirements

### Requirement: P0.2 必须原子切换旧 environment authority
**Reason**: P0.2 authority cutover 已完成，旧 v1 receipt migration 不再属于当前产品 runtime 或 sync 行为。

**Migration**: 尚未完成 P0.2 cutover 的旧 Workspace 必须先使用仍包含 legacy migration 的 Buildr 版本完成 sync；升级到本 Change 后不再提供旧 v1 reader。

### Requirement: Environment current store 必须支持一次性受控迁移
**Reason**: Environment current 已完成向 Workspace SQLite 的版本线迁移；继续扫描 `.buildr/tasks/<task-id>/environment.json` 会让已退出的文件重新成为潜在输入，并破坏 SQLite 单一 authority。

**Migration**: 尚未完成迁移的旧 Workspace 必须先使用仍包含 importer 的 Buildr 版本执行一次 canonical sync；升级到本 Change 后，旧文件只作为 inert local bytes，可由 Workspace owner 在确认 SQLite current 后删除。
