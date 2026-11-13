## ADDED Requirements

### Requirement: 模型目录支持按版本轻量核对

本机智能体服务 MUST 在 `GET /api/v1/app/agent-service/model-catalog` 响应中提供确定性内容版本（`revision`），并 MUST 支持通过可选 `?revision=<sha256>` 查询参数核对当前快照版本；无变化时 SHALL 只返回未变化标记与当前版本，不重复传输完整模型列表。不携带 `revision` 的请求 MUST 继续返回完整目录结构以保持兼容。

#### Scenario: 模型目录未变化与发生变化

- **WHEN** 客户端携带上次返回的 `revision` 请求模型目录，分别处于目录内容未变化与已更新状态
- **THEN** 目录内容未变化时服务 MUST 返回 `{ revision, unchanged: true }` 且客户端 MUST 复用上次完整目录
- **AND** 目录内容变化时服务 MUST 返回最新完整模型目录与新 `revision`；格式非法的 `revision` 参数 MUST 返回 400 错误
- **AND** 执行账号或偏好修改后，客户端后续读取 MUST 清空旧版本并在需要时重新取得最新完整目录

#### Scenario: 不带版本的既有读取兼容

- **WHEN** 客户端或测试在请求参数中不携带 `revision` 调用 `GET /api/v1/app/agent-service/model-catalog`
- **THEN** 服务 MUST 返回包含 `models`、`hasSnapshot`、可选 `diagnostic` 及当前 `revision` 的完整目录对象

### Requirement: 非代码视图下按需延后源代码观察

当用户处于工作空间非代码区域或处于全屏专注对话（`has-full-conversation`）时，前端应用壳层 SHALL 暂停 `source-control-watch` 长轮询与后台 `source-control` 状态核对及变更通知触发，避免智能体持续写入期间在后台重复查询 Git 状态；在用户切换至可见的代码视图、退出全屏专注对话回到代码视图或触发显式手动刷新时，系统 MUST 立即补做一次状态核对并恢复实时文件监听。

#### Scenario: 离开或未进入代码视图时暂停后台观察与激活补查

- **WHEN** 用户处于非代码页面或全屏专注对话状态期间，工作树文件连续变化或触发窗口聚焦
- **THEN** 系统 SHALL 不维持 `source-control-watch` 请求，也不因文件变更通知或聚焦触发后台 `source-control` 状态扫描；手动显式刷新仍 MUST 正常执行
- **AND** 当用户切回可见的代码视图时，系统 MUST 立即取消初始延迟、发起一次状态核对并重新建立文件变化监听
