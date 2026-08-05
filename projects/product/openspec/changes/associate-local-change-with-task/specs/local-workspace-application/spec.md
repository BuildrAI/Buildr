## ADDED Requirements

### Requirement: 全局 Change 详情必须按需关联已有 active Task

Local App 的 retained Workspace 全局 Change 详情 MUST 提供一个“关联到已有 Task”入口。该入口 MUST 只维护已存在的 active Task Record Change reference，不得创建 Task、复制 Change artifacts 或改变 OpenSpec Change lifecycle。

#### Scenario: 用户打开全局 Change 详情

- **WHEN** 用户进入 retained Workspace 的全局 Change 详情
- **THEN** 页面初始读取 MUST 只获取既有 Workspace 与 Change detail read model
- **AND** 页面 MUST 不读取 Task list、Task Environment、Git worktree、Change currentness 或 Task-scoped Change detail

#### Scenario: 用户主动打开关联面板

- **WHEN** 用户点击“关联到已有 Task”
- **THEN** Local App MUST 按需调用 active Task 的轻量 stored-state query projection
- **AND** 查询 MUST 只返回 Task Record 顶层事实、直接关系摘要、已保存 Change references 与 record digest
- **AND** 查询 MUST 不逐 Task 解析 Environment、Git、OpenSpec artifacts 或 currentness

#### Scenario: 关联 Change 到已有 Task

- **WHEN** 用户选择 active Task 并确认当前 retained Change
- **THEN** Local App MUST 通过受保护的 Task Record Application mutation 提交 `expectedRecordDigest` 与单个 `addChanges` reference
- **AND** Task Record Application MUST 继续负责 Change 引用校验、去重、CAS 冲突和持久化
- **AND** 成功后页面 MUST 导航到该 Task 详情并展示已保存 Change reference

#### Scenario: Task Record 已被其他客户端修改

- **WHEN** 关联 mutation 使用的 `expectedRecordDigest` 已过期
- **THEN** Local App MUST 显示稳定的冲突诊断并重新读取 active Task projection
- **AND** MUST 不自动合并、覆盖或重复提交旧 digest

#### Scenario: 没有 active Task

- **WHEN** 按需查询返回零个 active Task
- **THEN** 页面 MUST 显示交给 Agent 创建或恢复正式 Task 的受限 action
- **AND** 该 action MUST 只生成包含 Project、Change identity 和用户目标的 prompt
- **AND** Local App MUST 不创建 Task Record 或修改 Change artifacts

### Requirement: Change 关联入口必须保持全局与任务范围边界

Local App MUST 只在没有 Task context 的 retained 全局 Change 详情提供关联入口。Task-scoped Change 详情 MUST 继续只展示当前任务的 working copy、retained baseline 与 Planning Review action，不得通过该入口改变其他 Task 或全局 Change collection。

#### Scenario: 从 Task 详情打开关联 Change

- **WHEN** 用户打开 `/tasks/:taskId/changes/:project/:change`
- **THEN** 页面 MUST 保持现有 Task-scoped Resolver 读取与 Planning Review 路由
- **AND** 页面 MUST 不显示全局“关联到已有 Task”入口

#### Scenario: 关联操作成功后查看全局 Change

- **WHEN** Task Record 已保存某个 retained Change reference 且用户再次打开全局 Change 详情
- **THEN** 全局 Change collection MUST 仍只返回 retained active/archived Change
- **AND** 页面 MUST 不扫描或聚合 Task Environments 来显示额外 Change
