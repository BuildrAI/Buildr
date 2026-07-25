## MODIFIED Requirements

### Requirement: Buildr 按 Workspace 隔离共享任务资产观察
Buildr MUST 将任务资产 observation 保存到 canonical Workspace 的 `.buildr/asset-review/inbox/`，MUST 通过根 `.gitignore` 保证该目录 untracked，并 MUST 让同一物理 Workspace 的主 checkout、task worktree 与嵌套执行路径解析到同一 inbox。

#### Scenario: 主 checkout 与 task worktree 解析共享 inbox
- **WHEN** 主 checkout 与 linked task worktree 属于同一 canonical Workspace
- **THEN** provider MUST 将 observation 解析到 canonical Workspace 的同一 `.buildr/asset-review/inbox/`
- **AND** 每个任务 MUST 使用独立 observation id 和文件

#### Scenario: 不同物理 Workspace 隔离
- **WHEN** 两个物理 Workspace checkout 具有相同或不同的 `workspace.id`
- **THEN** 它们的 observation MUST 位于各自 canonical Workspace 的 `.buildr/asset-review/inbox/`
- **AND** provider MUST NOT 通过用户级全局目录把两个 checkout 合并为一个 inbox

#### Scenario: Observation 保持 untracked
- **WHEN** Buildr 初始化、更新或同步 Workspace baseline
- **THEN** 根 `.gitignore` MUST 包含 `/.buildr/asset-review/`
- **AND** observation 文件 MUST NOT 成为 Git tracked asset

### Requirement: 人工决定控制 Observation 去向
Provider MUST 在任务结束时完成覆盖核验；没有合格候选时 MUST 返回 `discarded` 并删除 observation，存在合格候选时 MUST 请求人工 accept 或 reject；未经决定 MUST NOT 把候选当作长期资产。

#### Scenario: 无合格候选
- **WHEN** observation 已被当前任务完整解决、被现有资产完整覆盖或不满足长期沉淀门槛
- **THEN** provider MUST 使用确定性 discard 动作删除 observation
- **AND** finalize 结果 MUST 为 `discarded`，不得请求用户接受同一项已完成修改

#### Scenario: 人工拒绝
- **WHEN** 用户明确判断 awaiting-human 候选无价值或拒绝候选
- **THEN** provider MUST 精确删除该 observation
- **AND** Buildr MUST NOT 创建 tracked tombstone 或维护记录

#### Scenario: 人工接受
- **WHEN** 用户接受 Rule、Skill、capability Contract 或 product follow-up 候选
- **THEN** provider MUST 记录目标类型和独立新任务 handoff
- **AND** 后续工作 MUST 重新进入 `task-triage`，新 task identity MUST 与来源任务不同

### Requirement: 只有实际资产变更保留维护历史
Buildr MUST 只为实际修改的 Rule、Skill 或 capability Contract 保存 tracked 维护记录；product follow-up MUST 使用 OpenSpec 吸收来源事实；provider MUST 在类型化完成证据满足对应 outcome 后才能删除 accepted observation。

#### Scenario: 新任务完成资产修改
- **WHEN** 接受的候选在新任务中实际修改 Rule、Skill 或 capability Contract
- **THEN** 新任务 MUST 在 `asset-maintenance/<type>/<asset-id>/records/` 创建记录并与资产变更一起提交
- **AND** `asset-integrated` 完成证据 MUST 包含 maintenance record、commit、target branch 和 remote ref
- **AND** observation MUST 只在该证据可核验后删除

#### Scenario: 调查后不修改
- **WHEN** 新任务正式核验后决定不修改目标资产
- **THEN** `no-change` 完成证据 MUST 包含新任务 identity、核验结论和稳定证据引用
- **AND** provider MUST 删除 observation 且 MUST NOT 长期保留无修改调查记录

#### Scenario: Product follow-up 吸收来源
- **WHEN** 接受的候选属于 product follow-up
- **THEN** 新任务的 OpenSpec proposal 或 design MUST 吸收必要来源事实
- **AND** `product-absorbed` 完成证据 MUST 包含 change identity 和实际 artifact 路径
- **AND** observation MUST 在 artifacts 可核验后删除，不得创建重复 `asset-maintenance` 记录

## ADDED Requirements

### Requirement: Buildr 安全迁移用户级 legacy Observation
Buildr MUST 在 v3 provider 首次访问 Workspace observation 时检查该 Workspace 的 v2 用户级 inbox，并 MUST 只迁移 identity 匹配且不会覆盖不同内容的 observation。

#### Scenario: 目标不存在时迁移 legacy observation
- **WHEN** legacy observation 的 Workspace identity 有效且 canonical Workspace 目标文件不存在
- **THEN** provider MUST 将该文件安全迁移到 `.buildr/asset-review/inbox/`
- **AND** 成功后 MUST 删除对应 legacy 来源文件

#### Scenario: 目标内容冲突
- **WHEN** legacy 来源与 canonical Workspace 目标使用同一 observation id 但内容不同
- **THEN** provider MUST fail closed 并保留两侧文件
- **AND** 诊断 MUST 返回来源、目标和冲突类型

#### Scenario: Legacy identity 无效
- **WHEN** legacy observation 损坏或其 Workspace identity 不匹配
- **THEN** provider MUST 保留 legacy 文件并拒绝迁移
- **AND** MUST NOT 用路径或文件名猜测其归属
