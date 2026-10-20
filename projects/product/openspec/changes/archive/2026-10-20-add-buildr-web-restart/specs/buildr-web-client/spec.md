## ADDED Requirements

### Requirement: Buildr Web 顶栏必须提供重启入口并保持退出可达
Buildr Web 客户端 MUST 在顶栏把重启与退出组织为同一控件组：重启作为默认主操作一键可达，退出经下拉菜单触发并保留既有危险确认、失败重试与稳定交互标识 `id=quit-buildr`；重启操作 MUST 提供稳定交互标识 `id=restart-buildr`。确认重启前 MUST 明示进行中的生成与任务验证将被取消。请求被接受后页面 MUST 呈现明确的「正在重启」状态，轮询确认新实例注入的会话令牌（session token）变化后执行整页刷新，使原地址继续可用；在约定时间内无法确认新实例时 MUST 呈现可重试与手动重新打开的指引，不冒称服务仍在运行。Preview 身份的页面 MUST NOT 呈现重启入口。

#### Scenario: 用户从顶栏发起重启
- **WHEN** 用户在非 Preview 页面点击 `id=restart-buildr` 并在确认框确认
- **THEN** 客户端 MUST 调用 `/api/v1/app/restart` 并进入可见的重启进行态
- **AND** MUST NOT 不经确认直接发起 restart 请求

#### Scenario: 重启后页面自动恢复
- **WHEN** restart 请求被接受后新实例就绪
- **THEN** 客户端 MUST 在检测到注入会话令牌变化后执行整页刷新
- **AND** 原地址 MUST 继续可用，已打开的其他标签刷新后 MUST 可继续操作

#### Scenario: 重启请求失败
- **WHEN** `/api/v1/app/restart` 返回稳定错误或拒绝
- **THEN** 客户端 MUST 呈现可辨认的失败信息与重试入口
- **AND** 退出菜单项 MUST 保持可用，页面不得进入假重启状态

#### Scenario: 重启等待超时
- **WHEN** 约定时间内未能确认新实例的会话令牌变化
- **THEN** 客户端 MUST 停止轮询并呈现重试与手动重新打开指引
- **AND** MUST NOT 断言服务仍在运行或已经退出

#### Scenario: 退出入口保留在下拉
- **WHEN** 用户展开重启按钮的下拉菜单并选择「退出 Buildr Web」
- **THEN** 客户端 MUST 走既有退出确认与 `id=quit-buildr` 交互路径
- **AND** 退出失败重试 Alert MUST 保持既有行为

#### Scenario: Preview 页面不呈现重启入口
- **WHEN** 页面携带 Preview 身份
- **THEN** 客户端 MUST NOT 呈现 `id=restart-buildr` 入口
- **AND** 退出入口 MUST 保持可用
