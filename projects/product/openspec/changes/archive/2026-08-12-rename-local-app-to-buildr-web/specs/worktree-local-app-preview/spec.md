## ADDED Requirements

### Requirement: task worktree 必须支持隔离的 Buildr Web 预览实例
Buildr MUST 提供 `buildr web preview start <instance>`，让 Agent 从指定 task environment 的 Buildr Product checkout 启动或复用独立的 loopback Buildr Web 预览。实例名 MUST 通过稳定安全校验；预览 MUST 使用独立于默认 Buildr Web 和其他 task environments 的状态目录、Workspace registry、实例记录和启动锁，且默认随机选择可用端口。

#### Scenario: 启动两个不同任务预览
- **WHEN** 两个不同 task environments 分别使用不同实例名启动预览
- **THEN** Buildr MUST 让两个健康实例同时监听各自的 loopback URL
- **AND** 两个预览 MUST NOT 复用实例记录、启动锁或 Workspace registry
- **AND** 默认 `buildr web` 实例 MUST 保持不受影响

#### Scenario: 同一 task environment 复用健康预览
- **WHEN** 同一 task environment 使用相同实例名和相同 Product checkout 再次启动健康预览
- **THEN** Buildr MUST 复用原实例并返回同一 URL 与 environment owner identity
- **AND** MUST NOT 额外启动第二个服务进程

#### Scenario: 不同 task environment 请求已被占用的实例名
- **WHEN** 一个健康 preview 的 owner environment 与启动请求的 task environment 不一致
- **THEN** Buildr MUST 拒绝复用或停止该 preview
- **AND** MUST 返回实例名、已登记 owner 与更换实例名或由 owner 停止的可执行动作

## MODIFIED Requirements

### Requirement: 预览必须提供可核验的运行身份
每个 preview MUST 持久化并返回实例名、task id、environment root、运行 Buildr Product 的 repository checkout、branch、HEAD、dirty 状态与 URL。CLI 启动/查看输出、受认证 health 响应和页面开发预览身份条 MUST 表达同一身份；默认 Buildr Web MUST 不显示 preview 身份条。

#### Scenario: Agent 启动预览后交接验收链接
- **WHEN** `buildr web preview start <instance>` 成功启动或复用实例
- **THEN** 输出 MUST 包含 URL、实例名、task id、environment root、Product checkout、branch、HEAD 与 dirty 状态
- **AND** Agent MUST 能仅凭该输出向用户提供可区分的验收链接

#### Scenario: 用户查看并行预览页面
- **WHEN** 用户打开任一 preview 的页面
- **THEN** 页面 MUST 展示只读的开发预览实例名、task environment 和 Product checkout identity
- **AND** 页面 MUST NOT 将该身份写入 Workspace 源资产或允许页面修改它

### Requirement: 预览实例必须可枚举并安全停止
Buildr MUST 提供 `buildr web preview list` 与 `buildr web preview stop <instance>`。list MUST 只枚举 Buildr preview 命名空间中的实例及其健康状态；stop MUST 仅能认证停止目标 task environment 拥有的 preview，且不得停止默认实例、其他 task environment 或其他实例。

#### Scenario: 查看多个 preview 状态
- **WHEN** Agent 运行 `buildr web preview list`
- **THEN** Buildr MUST 分别返回每个 preview 的实例名、environment owner identity、Product checkout、URL、PID 与健康或陈旧状态
- **AND** MUST NOT 枚举或管理非 Buildr 进程

#### Scenario: 停止当前任务 preview
- **WHEN** Agent 停止一个健康 preview、请求 environment 与 owner 匹配且状态记录的 secret 可认证该实例
- **THEN** Buildr MUST 请求该 preview 的显式退出并确认其不再健康
- **AND** MUST 只清理该 preview 命名空间内的实例记录

#### Scenario: 停止陈旧 preview 记录
- **WHEN** Agent 停止一个无法通过健康检查且 owner receipt 仍匹配当前 task environment 的 preview
- **THEN** Buildr MUST 只清理该 preview 命名空间内的陈旧记录
- **AND** MUST NOT 影响其他 preview、默认 Buildr Web 或 Workspace 源资产

### Requirement: task preview 不得改变 development launcher
`buildr web preview` MUST 直接使用请求 task environment 中的 Buildr Product checkout 启动预览，且 MUST NOT 安装、更新、替换、停止或重新指向 `Buildr Web Dev.app`、全局开发 CLI 或默认 Buildr Web。

#### Scenario: task environment 启动 preview
- **WHEN** Agent 从 task environment 启动 preview
- **THEN** 运行 identity MUST 指向该 environment 中明确的 Buildr Product checkout
- **AND** `/Applications/Buildr Web Dev.app` 的安装 identity MUST 保持不变

### Requirement: Preview stop 必须绑定 task environment 所有权
对正式 Task 创建的 Buildr Web preview，`web preview stop` MUST 要求并核对 Task ID、canonical Workspace、Environment root、Environment Receipt resource ID、preview provider identity/handle、provider owner 与 secret，并 MUST 仅停止完全匹配的实例。停止成功后 preview provider MUST 通过可信 retained Environment Manager 释放对应 resource；retained manager content identity MUST NOT 成为 ownership 条件，独立 retained Workspace preview MAY 保持既有实例级停止语义。

#### Scenario: 正确 owner 停止 Task Preview
- **WHEN** 调用方提供与 Environment resource/preview metadata 一致的 Task、Workspace、Environment root、resource ID、provider identity/handle，且实例 secret 有效
- **THEN** Buildr MUST 停止 preview、确认进程终止并删除本实例运行状态
- **AND** MUST 通过 Environment `resource release` 更新同一 receipt，并在 JSON 结果记录 provider 与 Environment 两侧 evidence

#### Scenario: retained manager 已升级
- **WHEN** Task Preview owner/resource facts 全部匹配，但当前 clean retained Environment Manager 的 content identity 与 Preview 创建时不同
- **THEN** Preview stop/resource release MUST 继续按 Environment/resource/provider ownership 执行
- **AND** MUST NOT 要求 controller handoff、改写 owner generation 或拒绝旧 owner 中缺少/包含不同 `controllerIdentity`

#### Scenario: 错误 owner 尝试停止 Preview
- **WHEN** 调用方的 Task、Workspace、Environment root、resource ID、provider identity/handle、preview owner 或 secret 任一不匹配
- **THEN** Buildr MUST fail closed 且不得向进程发送停止信号或修改 Environment Receipt
- **AND** 实例 MUST 继续可被真实 owner/Task Environment 检查和停止

#### Scenario: 进程已退出但资源记录仍在
- **WHEN** preview provider 证明目标实例不再健康且 metadata 仍与 Environment resource 匹配
- **THEN** Buildr MUST 只清理本实例陈旧运行状态并释放对应 Environment resource
- **AND** MUST NOT 把没有匹配 receipt 的同名进程或端口当作该 Task 资源

### Requirement: Task Preview 必须登记为 Environment 动态资源
正式 Task 的 Buildr Web Preview MUST 在进程健康后、向调用方报告 start 成功前，通过可信 retained Environment Manager 登记为 Task-owned 动态资源。Environment Receipt MUST 保存 preview instance、Task、canonical Workspace、Environment root、工作范围、Product checkout、URL/port、process/provider identity 和非敏感 cleanup handle；preview store MUST 继续拥有进程 secret 与实例运行细节，MUST NOT 使用 manager content hash 表达资源 ownership。

#### Scenario: 成功启动 Task Preview
- **WHEN** `buildr web preview start <instance>` 已启动健康进程且请求来自 matching `ready` Task Environment
- **THEN** preview manager MUST 调用 Environment `resource register` 并取得 matching resource identity
- **AND** 只有登记成功后才 MUST 返回 start success、URL 与 Environment resource evidence

#### Scenario: Environment 登记失败
- **WHEN** preview 已健康但 Environment Receipt 缺失、owner/scope 不匹配或写入失败
- **THEN** preview manager MUST 立即认证停止刚创建的实例并清理本实例状态
- **AND** MUST 返回 start blocked，且不得影响默认 Buildr Web、其他 preview 或其他 Task receipt

#### Scenario: 恢复 Environment 时发现 Preview
- **WHEN** Task Environment restore 读取已登记 preview resource
- **THEN** Environment MUST 通过 preview provider probe 复核实例 identity 与健康状态
- **AND** MUST 将真实 running/stale/released 事实写入同一 receipt，而不是扫描进程名、端口或比较 controller hash 猜 ownership

#### Scenario: Environment cleanup 停止 Preview
- **WHEN** Task Environment cleanup 处理已登记 preview resource
- **THEN** 它 MUST 先调用 preview provider 认证停止实例，再记录 resource release
- **AND** Git worktree provider cleanup MUST 只在 preview 已停止后继续

## REMOVED Requirements

### Requirement: task worktree 必须支持隔离的 Local App 预览实例
Buildr MUST 提供 `buildr app preview start <instance>`，让 Agent 从指定 task environment 的 Buildr Product checkout 启动或复用独立的 loopback Local App 预览。实例名 MUST 通过稳定安全校验；预览 MUST 使用独立于默认 Local App 和其他 task environments 的状态目录、Workspace registry、实例记录和启动锁，且默认随机选择可用端口。

#### Scenario: 启动两个不同任务预览
- **WHEN** 两个不同 task environments 分别使用不同实例名启动预览
- **THEN** Buildr MUST 让两个健康实例同时监听各自的 loopback URL
- **AND** 两个预览 MUST NOT 复用实例记录、启动锁或 Workspace registry
- **AND** 默认 `buildr app` 实例 MUST 保持不受影响

#### Scenario: 同一 task environment 复用健康预览
- **WHEN** 同一 task environment 使用相同实例名和相同 Product checkout 再次启动健康预览
- **THEN** Buildr MUST 复用原实例并返回同一 URL 与 environment owner identity
- **AND** MUST NOT 额外启动第二个服务进程

#### Scenario: 不同 task environment 请求已被占用的实例名
- **WHEN** 一个健康 preview 的 owner environment 与启动请求的 task environment 不一致
- **THEN** Buildr MUST 拒绝复用或停止该 preview
- **AND** MUST 返回实例名、已登记 owner 与更换实例名或由 owner 停止的可执行动作
