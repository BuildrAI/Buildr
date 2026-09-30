## ADDED Requirements

### Requirement: installation status 必须区分同槽位旧版本实例与外来实例

Buildr 的公开 `installation status` MUST 在健康探测就绪之外比对运行中实例的产品身份与当前安装身份。released 实例健康但 `productIdentity`/`launcherIdentity` 所示安装身份与当前登记安装不一致时，Buildr MUST 判断该实例是否与当前安装属于同一安装槽位（installation slot）：由 Launcher 启动的实例以其 `launcherIdentity.installationSlotIdentity` 对比当前 binding；无 `launcherIdentity` 的实例以 `productIdentity.installationIdentity` 对比产品安装登记中同 `entryPath`/`productRoot` 的相邻记录。可证明同槽位时 MUST 将 `instances.released.status` 报告为 `stale` 并说明运行版本落后于安装版本、可经 Launcher 完成重启交接；无法证明同槽位时 MUST NOT 报告为可重启状态，保留可供消费方 fail closed 的身份事实。development 实例不因版本差异报告 `stale`。

#### Scenario: 同槽位旧版本实例报告可重启

- **WHEN** npm 安装更新后，同一安装槽位启动的旧版本 released 实例仍健康运行
- **THEN** `installation status` MUST 将 `instances.released.status` 报告为 `stale`，并保留实例地址、PID 与已观察身份
- **AND** `reason` MUST 说明运行版本与当前安装版本不一致且可经 Launcher 重启交接

#### Scenario: 同槽位旧版本实例触发入口重启

- **WHEN** 实例因同槽位旧版本报告为 `stale`，且消费方执行 Launcher 启动
- **THEN** Runtime MUST 走既有 Launcher handoff 语义：优雅停止旧实例并按当前 binding 启动新实例
- **AND** MUST NOT 并行运行两个 released 实例或强杀未经认证的进程

#### Scenario: 外来实例保持拒绝语义

- **WHEN** 健康 released 实例的安装槽位无法证明属于当前安装，或 channel 为 `profile-conflict`
- **THEN** status MUST NOT 将其报告为 `stale` 可重启，消费方的既有身份匹配拒绝行为继续生效
- **AND** MUST NOT 丢失实例已观察身份与 URL 事实

#### Scenario: development 实例不因版本报告 stale

- **WHEN** development 实例健康运行且其构建版本与登记开发安装不一致
- **THEN** status MUST 保持既有开发实例判定，不因版本差异降级为 `stale`

## MODIFIED Requirements

### Requirement: npm Buildr Web Launcher 必须提供显式可恢复 lifecycle

Buildr MUST 只从 formal npm installation 提供 `buildr web launcher install|status|repair|uninstall`。普通 npm install MUST NOT 修改 Applications、Desktop 或 Start Menu；所有 Launcher mutation MUST 由显式命令或同 ownership npm update 后的受限 refresh 触发。macOS 未显式给出 `--target` 时 Launcher 默认目标 MUST 为 `/Applications/Buildr Web.app`；该默认位置不可写或写入失败时 MUST fail closed 返回可解释错误并指引 `--target` 参数，MUST NOT 静默改用 `~/Applications`。`status`、`repair`、`uninstall` 与 npm update refresh 未显式给出 `--target` 时 MUST 先核对 `/Applications`，缺席时再核对遗留的 `~/Applications` 位置，并按真实目标操作同一 ownership 的 Launcher；`install` 在新目标成功创建后 MUST 移除同一 installation slot 在 `~/Applications` 的既有 Launcher，使本机只保留一份正式版图形入口。

#### Scenario: 显式安装 Launcher

- **WHEN** 用户从 formal npm installation 执行 `buildr web launcher install`
- **THEN** Buildr MUST 原子创建本机 Launcher 与 closed binding，并返回 ownership、target、Host Node、package entry、prefix 与 payload identity
- **AND** macOS 默认目标 MUST 为 `/Applications/Buildr Web.app`
- **AND** target 已由 foreign installation 管理时 MUST fail closed 且不得覆盖

#### Scenario: 默认目标不可写

- **WHEN** macOS 默认 `/Applications` 因权限等原因不可写且未提供 `--target`
- **THEN** install MUST 返回可解释错误并明确 `--target` 用法
- **AND** MUST NOT 静默写入 `~/Applications` 或请求提权

#### Scenario: 旧位置遗留 Launcher 的读取与迁移

- **WHEN** Launcher 位于遗留 `~/Applications` 而 `/Applications` 无该入口
- **THEN** `status`、`repair`、`uninstall` 与 npm update refresh MUST 按真实旧目标操作并在结果中如实呈现 target
- **AND** `install` 默认目标成功创建后 MUST 移除该 installation slot 的旧位置 Launcher

#### Scenario: 查询与修复 Launcher

- **WHEN** 用户执行 `launcher status` 或 `launcher repair`
- **THEN** status MUST 只读返回 `ready|stale|invalid|absent` 与精确诊断，repair MUST 只从当前已验证 npm installation 重建同 ownership binding
- **AND** repair MUST NOT 从 PATH 搜索 Node、npm 或 Buildr，也不得改绑另一个 prefix

#### Scenario: 卸载 Launcher

- **WHEN** 用户执行 `launcher uninstall`
- **THEN** Buildr MUST 只删除 binding 与 target ownership identity 精确匹配的 `.app` 或 shortcut
- **AND** MUST 保留 npm package、Workspace Registry、SQLite、日志、Workspace data 与 Agent runtime
