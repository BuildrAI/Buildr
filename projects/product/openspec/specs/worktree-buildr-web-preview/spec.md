# worktree-buildr-web-preview Specification

## Purpose

Define isolated Buildr Web previews for concurrent task worktrees.

## Requirements

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

### Requirement: task worktree 必须支持隔离的 Buildr Web 预览实例
Buildr MUST提供`buildr web preview start <instance>`，让Agent从指定Task Worktree或独立Git checkout的Buildr Product入口启动或复用独立loopback Preview。实例名 MUST通过稳定安全校验；Preview MUST使用独立于默认Buildr Web和其他Worktree的状态目录、Workspace registry、实例记录与启动锁，并默认随机选择可用端口。

#### Scenario: 启动两个不同任务预览
- **WHEN** 两个不同Task Worktrees分别使用不同实例名启动Preview
- **THEN** Buildr MUST让两个健康实例同时监听各自loopback URL
- **AND** 两个Preview MUST NOT复用实例记录、启动锁或Workspace registry，默认Buildr Web保持不受影响

#### Scenario: 同一 task environment 复用健康预览
- **WHEN** 同一Task、Workspace、Worktree evidence与Product checkout使用相同实例名再次启动健康Preview
- **THEN** Buildr MUST复用原实例并返回同一URL与owner identity
- **AND** MUST NOT额外启动第二个进程

#### Scenario: 不同 task environment 请求已被占用的实例名
- **WHEN** 健康Preview的Task、Workspace或Worktree owner与新请求不一致
- **THEN** Buildr MUST拒绝复用或停止该Preview
- **AND** MUST返回当前owner并要求更换实例名或由真实owner停止

### Requirement: Task Preview 的公开标签必须使用 Buildr Web Preview
Task Preview 的页面、日志、验证结果和文档 MUST 使用 Buildr Web Preview；`local-app-preview` provider、`BUILDR_LOCAL_APP_PREVIEW` 和 preview JSON schema MUST 作为稳定兼容 identity 保留。

#### Scenario: 启动 Task Preview
- **WHEN** Agent 为 Task Environment 启动 preview
- **THEN** 可见标签 MUST 为 Buildr Web Preview
- **AND** 旧 provider、环境变量和 schema reader MUST 继续可用

### Requirement: Task Preview 必须由 Preview Application 持有资源所有权
Buildr Web Preview MUST在自身实例store中保存Task ID、canonical Workspace、matching Worktree evidence、实际Buildr Product checkout、repository、branch、HEAD、PID、URL、secret与provider identity。Preview MUST独立执行start/list/stop和失败回收，不得要求Environment ready或写Environment Receipt。

#### Scenario: 从Task Worktree启动Preview
- **WHEN** Agent提供Task ID与canonical Workspace，且matching Worktree evidence证明实际checkout
- **THEN** Preview MUST从该checkout中的Buildr Product入口启动独立loopback实例
- **AND** 只有进程健康且owner写入成功后才 MUST返回started

#### Scenario: Preview启动后owner写入失败
- **WHEN** 子进程已经健康但Preview owner无法安全保存
- **THEN** Preview MUST使用刚创建的ChildProcess/secret认证停止该实例并确认回收
- **AND** MUST NOT报告资源已由Task、Worktree或Environment管理

#### Scenario: Preview停止
- **WHEN** stop请求的Task、Workspace、Worktree evidence、实例owner与secret完全匹配
- **THEN** Preview MUST停止目标实例并删除本实例状态
- **AND** MUST NOT修改Task Record、Worktree evidence或任何Environment数据
