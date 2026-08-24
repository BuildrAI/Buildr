## MODIFIED Requirements

### Requirement: npm 用户必须能够启动和退出本机 Buildr Web
普通 npm 用户 MUST 能通过 `buildr web` 或显式安装的 `Buildr Web` Launcher 启动同一 npm Buildr Web Runtime，并 MUST 能通过公开退出动作停止实例。图形 Launcher MUST 只执行其 binding 记录的 Host Node + package entry + `web`；当前产品 MUST NOT 要求或声称存在平台 installer、Product Node 或 SEA。Runtime MUST 将同 profile 的运行兼容性与 Launcher 连续性所有权分别判断，并 MUST NOT 让 Launcher 仅复用一个无法证明由当前 binding 托管的实例后退出。

#### Scenario: 命令行启动
- **WHEN** 用户从 npm installation 执行 `buildr web`
- **THEN** Buildr MUST 启动或复用本机单实例 HTTP runtime，并在 ready 后按选项打开浏览器
- **AND** 非 Web CLI MUST NOT 启动 HTTP 服务

#### Scenario: 图形入口启动
- **WHEN** 用户点击已验证的 `Buildr Web` 本机 Launcher
- **THEN** wrapper MUST 使用绝对 Host Node 与 package entry 执行 `web --launcher-binding <binding>`，由同一Buildr runtime等待health/readiness并打开浏览器
- **AND** MUST NOT 启动第二份 Buildr、复制 runtime、使用 shell PATH 或嵌入桌面 WebView

#### Scenario: binding 已漂移
- **WHEN** Launcher 记录的 Node、entry、package root、prefix、payload 或 ownership identity 与当前文件事实不符
- **THEN** Launcher MUST fail closed、写入可诊断日志并提示 `buildr web launcher repair`
- **AND** MUST NOT 尝试 PATH 中的另一个 `buildr`

#### Scenario: Launcher 复用当前 binding 实例
- **WHEN** Launcher 发现同 released profile 的健康实例，且实例 `launcherIdentity.bindingIdentity` 与当前 binding 精确匹配
- **THEN** Runtime MUST 复用该实例并打开其页面
- **AND** MUST NOT 重启实例或创建第二个后台 runner

#### Scenario: Launcher 接管同 installation 的前台 CLI 实例
- **WHEN** Launcher 发现同 released profile 的健康实例，实例没有 `launcherIdentity`，且其 npm installation、payload 与 protocol identity 均与当前 binding 匹配
- **THEN** Runtime MUST 在 profile-scoped 单实例锁内重新认证实例，通过公开 instance secret 优雅停止旧实例，并按当前 binding 端口策略启动新实例
- **AND** Launcher MUST 只在新实例 health 返回当前 binding identity 后打开浏览器并报告成功
- **AND** 新实例 MUST 不依赖原 CLI 终端继续存活

#### Scenario: Launcher 受控替换同 slot 的旧 binding 实例
- **WHEN** 健康实例由旧 Launcher binding 启动，且其 installation slot 与 Launcher ownership 可证明和当前 binding 连续
- **THEN** Runtime MUST 在同一单实例锁内优雅停止旧实例并启动当前 binding 实例
- **AND** MUST NOT 并行运行两个 released writer

#### Scenario: Launcher handoff ownership 无法证明
- **WHEN** 健康实例属于另一 profile、另一 installation slot、foreign Launcher，或缺少完成安全交接所需的身份事实
- **THEN** Runtime MUST fail closed 并保留现存实例与 receipt
- **AND** MUST NOT 强杀、覆盖、跨 profile 停止或启动第二个实例

#### Scenario: Launcher handoff 超时
- **WHEN** 可接管实例未在有界时间内完成认证退出，或并发 Launcher 未等到当前 binding 的健康实例
- **THEN** Runtime MUST 返回可诊断失败并保留可恢复现场
- **AND** MUST NOT 把旧 CLI 实例或任意健康实例报告为 Launcher 托管成功

#### Scenario: 前台实例收到 SIGHUP
- **WHEN** 非 Windows Buildr Web Runtime 收到 `SIGHUP`
- **THEN** Runtime MUST 按优雅关闭路径停止 HTTP server 并清理仍匹配本实例的 receipt
- **AND** 该清理 MUST NOT 把普通 CLI 启动解释为 Launcher 托管
