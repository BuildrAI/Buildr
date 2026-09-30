## MODIFIED Requirements

### Requirement: 有界静默启动
目标实例未运行时，插件（Plugin）MUST 复用已验证安装对应的既有启动器（Launcher），仅为相关子进程设置 `BUILDR_LAUNCHER_NO_OPEN=1`，并通过公开健康查询进行有超时的就绪等待。启动返回成功 MUST NOT 被当作服务已就绪。目标实例被 Buildr 报告为 `stale`（同一安装槽位的旧版本仍在运行）时视为未就绪实例：插件（Plugin）MUST 走同一 Launcher 启动路径，由 Buildr 完成旧实例的优雅交接，而不是将其当作外来实例拒绝。

#### Scenario: 目标尚未运行
- **WHEN** 用户点击且目标安装有效但实例未运行
- **THEN** 插件（Plugin）MUST 启动正确渠道并等待真实就绪
- **AND** MUST NOT 打开系统浏览器、修改全局环境或重复并发启动

#### Scenario: 同槽位旧版本实例重启交接
- **WHEN** `installation status` 将目标实例报告为 `stale`（运行版本落后于已安装版本但安装槽位可证明一致）
- **THEN** 插件（Plugin）MUST 启动对应渠道的 Launcher 并继续等待真实就绪
- **AND** MUST NOT 把该状态作为身份不匹配直接拒绝，也不得自行终止既有服务

#### Scenario: 启动失败或超时
- **WHEN** 启动命令失败或有界等待结束仍未就绪
- **THEN** 插件（Plugin）MUST 停止本次等待，显示简短原因并提供可重试操作
- **AND** MUST NOT 无限轮询或擅自终止既有服务
