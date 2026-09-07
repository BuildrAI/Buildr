## ADDED Requirements

### Requirement: Buildr Web 任务目录必须默认聚焦未结束任务
Buildr Web Task 列表首次进入和清除筛选 MUST使用 `status=open`，并 MUST保留 `all|completed|abandoned` 等显式状态选择。选择 `pending-decision|decided` 复盘筛选时 MUST自动切换页面状态为 `all`。后端省略 status 的 `all` 语义 MUST保持不变。

#### Scenario: 首次进入列表
- **WHEN** Workspace 同时包含 todo、active 与 terminal Tasks
- **THEN** 页面首个 Task list 请求 MUST携带 `status=open`
- **AND** 表格 MUST只显示 todo 与 active Tasks

#### Scenario: 查看等待决定的复盘
- **WHEN** 用户选择 `pending-decision` 复盘筛选
- **THEN** 页面 MUST把 status 切换为 `all` 并显示匹配的 terminal Tasks

#### Scenario: 新旧请求交错完成
- **WHEN** 新筛选响应先于旧请求返回
- **THEN** 页面 MUST只采用最新请求结果
- **AND** 旧响应 MUST不覆盖 tasks、diagnostics、filter options 或空状态

### Requirement: Buildr Web Task 详情必须使用唯一 DOM identity
Task 详情加载态与已加载视图 MUST不同时生成重复 `id="task-detail-id"`。真实任务编号的 DOM hook MUST在每个页面最多出现一次。

#### Scenario: 打开已加载详情
- **WHEN** Browser 打开任意 Task detail
- **THEN** `#task-detail-id` MUST恰好匹配一个元素并显示当前 Task ID
- **AND** Task Record facts 内的重复展示 MUST使用不同 hook 或无 ID

## REMOVED Requirements

### Requirement: mutation 必须使用 current identity 并受界面安全保护
**Reason**: 该 Requirement 只描述已退役 Parent Plan reconciliation；当前父任务关系和完成写入由 Task Record v3 的 record digest 与父任务完成快照保护。

**Migration**: 使用 Task Record update/complete 的 current digest 和明确父任务完成授权。

#### Scenario: 请求旧 Parent Plan mutation
- **WHEN** 客户端提交旧 reconciliation 或 final acceptance mutation
- **THEN** HTTP MUST不提供该旧 route
- **AND** MUST不建立兼容写入

### Requirement: Task Preview Server 必须禁用 scheduled maintenance
**Reason**: 该 Requirement 专门保护已退役 Execution Record GC scheduler；当前 Web Runtime 已无该 scheduler。

**Migration**: Preview 继续由自身 owner、进程 secret 与 Worktree identity 保护，不需要 Execution Record 特例。

#### Scenario: 启动 Preview
- **WHEN** Buildr Web Preview 启动并持续运行
- **THEN** MUST只管理自身进程和静态资源
- **AND** MUST不存在 Execution Record timer、GC 或数据访问
