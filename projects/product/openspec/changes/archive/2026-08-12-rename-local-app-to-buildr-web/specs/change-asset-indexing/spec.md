## ADDED Requirements

### Requirement: Task-scoped Change 引用必须从受信任的 Buildr Web Task 范围解析
Buildr MUST 提供任务范围 Change 引用解析器（Task-scoped Change Reference Resolver），以 canonical Workspace、Task ID 与限定 `project/change` 为唯一调用身份，并 MUST 通过 Task Environment 的 saved-current 只读 port 获取持久化 Receipt 中匹配 Project scope 的实际执行根。Resolver MUST 将只读路径可用性与 Environment 整体执行 readiness 分开判断：当 Receipt 状态为 `ready` 或 `blocked` 时，只要 Task、Project scope、Project source path、execution root 与 validation root 的归属仍可证明且候选目录当前可读，就 MUST 允许读取该 Task working copy。Resolver MUST NOT 信任请求 filesystem path、server cwd、branch、remote 或 worktree 名，不得把 blocked Environment 解释为可执行，也 MUST NOT 建立第二套持久 Change 状态。

#### Scenario: Change 只存在于 Task Environment
- **WHEN** matching saved Environment Receipt 的 Project 执行根包含合法 active 或 archived Change，而 retained Project 尚无该 Change
- **THEN** task-scoped resolution MUST 返回该 Change 的真实 lifecycle 与 `task-environment candidate` provenance
- **AND** MUST 使用与 canonical Change indexing 相同的 path/symlink/artifact 安全校验

#### Scenario: 非路径 readiness 阻塞但 Change 仍可读
- **WHEN** saved Environment Receipt 状态为 `blocked`，阻塞来自 runtime、CLI、依赖、projection 或其他执行 readiness probe，但 matching Project scope 与路径归属仍可证明且 Change 目录当前可读
- **THEN** task-scoped resolution MUST 继续返回 `task-environment candidate`
- **AND** Environment 阻塞 MUST 只保留为 Environment 诊断，不得被转换为 Change unavailable 或任何执行授权

#### Scenario: Task Environment 与 retained 同时存在同名 Change
- **WHEN** matching task Project root 与 retained Project canonical root 都包含同名 active Change
- **THEN** task-scoped resolution MUST 将任务环境副本作为当前 Task working copy，并把 retained 副本作为 `retained baseline` provenance 分开返回
- **AND** MUST NOT 合并 artifacts、覆盖其中一份或把两份误报为两个 Task Record 引用

#### Scenario: 安装版 Buildr Web 读取 candidate-only Change
- **WHEN** 安装版 Buildr Web 的 product sourceRoot 不同于 Receipt controller，且持久化 Receipt 的 Task Environment Project execution root 含有 retained Project 不存在的合法 Change
- **THEN** Task-scoped detail route MUST 通过共享 Resolver 返回该 Change 与 `task-environment candidate` provenance
- **AND** MUST NOT 仅因 Buildr Web bundle root 与 controller sourceRoot 不同而回退到 retained Project

#### Scenario: Task Environment 副本不可用
- **WHEN** Task 没有 matching Environment Receipt、Receipt 已 cleaned、当前机器没有该执行根、Project scope/source path 不匹配，或 execution root 与 validation root 的归属无法证明
- **THEN** Resolver MUST 只回退到 retained Project canonical root，并 MAY 返回 active 或 archived Change
- **AND** retained 也不可解析时 MUST 返回稳定 unavailable/not-found diagnostic，不得猜测路径或创建目录

#### Scenario: 请求提交文件系统位置
- **WHEN** task-scoped Change 请求包含 `target`、`root`、`path`、cwd 或其他未登记位置提示
- **THEN** interface MUST 在读取 Change artifacts 前拒绝请求
- **AND** Resolver MUST 只从 Workspace registry、Task identity、Environment saved-current read port 与 Project registry 构造安全候选根

## MODIFIED Requirements

### Requirement: Task-scoped Change 投影不得改变全局 retained 索引
Buildr MUST 只在明确 Task context 的引用校验和详情读取中使用 task-scoped Change resolution。Workspace 全局 Change collection MUST 继续只从 retained Project canonical OpenSpec root 索引 active/archived Change，不得扫描全部 Task Environments 或把未集成候选混入全局列表。

#### Scenario: 全局列出 Change
- **WHEN** 用户打开 Workspace/Project 全局 Change 页面或调用既有 Change collection
- **THEN** collection MUST 保持 retained-only active/archived 结果
- **AND** MUST NOT 因某个任务环境存在 candidate 而新增、替换或隐藏全局条目

#### Scenario: 从 Task 详情打开关联 Change
- **WHEN** 用户从 `/workspaces/:workspaceId/tasks/:taskId` 打开某个 `{project, change}` 引用
- **THEN** Buildr Web MUST 使用 Task ID 调用 task-scoped detail route，并展示 candidate/retained/archived/unavailable provenance
- **AND** HTTP/Web MUST 复用共享 Resolver，不得实现第二套 root selection 或直接解析 Environment Receipt

#### Scenario: 候选集成到 retained source
- **WHEN** task-environment candidate 已进入 retained Project 且任务环境副本随后清理
- **THEN** 同一 `{project, change}` 逻辑引用 MUST 自然解析为 retained active 或 archived Change
- **AND** Task Record MUST NOT 因来源切换而改写引用或保存历史 checkout path

## REMOVED Requirements

### Requirement: Task-scoped Change 引用必须从受信任任务范围解析
Buildr MUST 提供任务范围 Change 引用解析器（Task-scoped Change Reference Resolver），以 canonical Workspace、Task ID 与限定 `project/change` 为唯一调用身份，并 MUST 通过 Task Environment 的 saved-current 只读 port 获取持久化 Receipt 中匹配 Project scope 的实际执行根。Resolver MUST 将只读路径可用性与 Environment 整体执行 readiness 分开判断：当 Receipt 状态为 `ready` 或 `blocked` 时，只要 Task、Project scope、Project source path、execution root 与 validation root 的归属仍可证明且候选目录当前可读，就 MUST 允许读取该 Task working copy。Resolver MUST NOT 信任请求 filesystem path、server cwd、branch、remote 或 worktree 名，不得把 blocked Environment 解释为可执行，也 MUST NOT 建立第二套持久 Change 状态。

#### Scenario: Change 只存在于 Task Environment
- **WHEN** matching saved Environment Receipt 的 Project 执行根包含合法 active 或 archived Change，而 retained Project 尚无该 Change
- **THEN** task-scoped resolution MUST 返回该 Change 的真实 lifecycle 与 `task-environment candidate` provenance
- **AND** MUST 使用与 canonical Change indexing 相同的 path/symlink/artifact 安全校验

#### Scenario: 非路径 readiness 阻塞但 Change 仍可读
- **WHEN** saved Environment Receipt 状态为 `blocked`，阻塞来自 runtime、CLI、依赖、projection 或其他执行 readiness probe，但 matching Project scope 与路径归属仍可证明且 Change 目录当前可读
- **THEN** task-scoped resolution MUST 继续返回 `task-environment candidate`
- **AND** Environment 阻塞 MUST 只保留为 Environment 诊断，不得被转换为 Change unavailable 或任何执行授权

#### Scenario: Task Environment 与 retained 同时存在同名 Change
- **WHEN** matching task Project root 与 retained Project canonical root 都包含同名 active Change
- **THEN** task-scoped resolution MUST 将任务环境副本作为当前 Task working copy，并把 retained 副本作为 `retained baseline` provenance 分开返回
- **AND** MUST NOT 合并 artifacts、覆盖其中一份或把两份误报为两个 Task Record 引用

#### Scenario: 安装版 Local App 读取 candidate-only Change
- **WHEN** 安装版 Local App 的 product sourceRoot 不同于 Receipt controller，且持久化 Receipt 的 Task Environment Project execution root 含有 retained Project 不存在的合法 Change
- **THEN** Task-scoped detail route MUST 通过共享 Resolver 返回该 Change 与 `task-environment candidate` provenance
- **AND** MUST NOT 仅因 Local App bundle root 与 controller sourceRoot 不同而回退到 retained Project

#### Scenario: Task Environment 副本不可用
- **WHEN** Task 没有 matching Environment Receipt、Receipt 已 cleaned、当前机器没有该执行根、Project scope/source path 不匹配，或 execution root 与 validation root 的归属无法证明
- **THEN** Resolver MUST 只回退到 retained Project canonical root，并 MAY 返回 active 或 archived Change
- **AND** retained 也不可解析时 MUST 返回稳定 unavailable/not-found diagnostic，不得猜测路径或创建目录

#### Scenario: 请求提交文件系统位置
- **WHEN** task-scoped Change 请求包含 `target`、`root`、`path`、cwd 或其他未登记位置提示
- **THEN** interface MUST 在读取 Change artifacts 前拒绝请求
- **AND** Resolver MUST 只从 Workspace registry、Task identity、Environment saved-current read port 与 Project registry 构造安全候选根
