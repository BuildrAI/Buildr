## ADDED Requirements

### Requirement: 列表查询优化
系统 SHALL 在 `GET /api/v1/programmatic/workspaces/{workspaceId}/conversations` 支持 `active=true`（仅返回 activity.active 为 true 的对话）、`attention=true`（仅返回有待决请求、失败或卡住的对话）、`fields=summary`（每个对话仅返回 id、title、runStatus、updatedAt、active、pendingDecisionCount）。返回 MUST 固定带 activityCounts，limit MUST 生效。

#### Scenario: 过滤与投影
- **WHEN** 程序携带 active=true 或 attention=true 或 fields=summary 查询列表
- **THEN** 系统 MUST 按参数过滤或投影，固定返回 activityCounts，且 limit 生效

### Requirement: 单步续聊
系统 SHALL 提供 `POST /api/v1/programmatic/workspaces/{workspaceId}/conversations/{conversationId}/messages`（execute 权限），请求体 text（必填）、clientRequestId（必填）、expectedRevision（可选）。服务端 MUST 内部完成 prepare-send 和 send，沿用对话原连接和模型，返回 202 和 runId。幂等规则 MUST 与现有 send 相同；对话正在运行或修订不一致 MUST 返回 409。

#### Scenario: 单步续聊成功
- **WHEN** 程序对空闲对话提交合法 text 与 clientRequestId
- **THEN** 系统 MUST 内部完成 prepare-send+send，沿用原连接与模型，返回 202 与 runId

#### Scenario: 幂等与冲突
- **WHEN** 同一 clientRequestId 重试，或对话正在运行，或 expectedRevision 不一致
- **THEN** 相同输入重试 MUST 复用原执行不新建工作；运行中或修订不一致 MUST 返回 409

### Requirement: 凭据回推配置管理
系统 SHALL 允许经宿主认证在每个程序接入凭据下读取、版本化保存回推设置（接收地址、启用开关、速率限制），主动查看密钥与发送测试通知，并读取最近投递记录。普通配置读取 MUST 不返回密钥；密钥仅存本机私有文件，界面默认隐藏、日志不输出明文。保存 MUST 校验已观察修订，空密钥输入保留原值，首次启用缺少密钥拒绝。

#### Scenario: 配置与停用
- **WHEN** 用户保存有效地址与密钥或停用某凭据回推
- **THEN** 系统 MUST 安全保存私有配置且无需重启生效，停用保留配置但停止新发送；空密钥保留原值，首次启用缺密钥拒绝

#### Scenario: 密钥查看与测试
- **WHEN** 用户经会话认证与当前修订校验点击查看密钥或测试
- **THEN** 独立请求才返回明文且禁缓存；测试发送独立标注 test 的无业务内容请求，禁重定向、5 秒超时、不重试，界面显示最近结果，不暴露响应正文或密钥

## MODIFIED Requirements

### Requirement: 可发现的当前能力
系统 SHALL在固定HTTP路径返回认证调用方可访问的工作空间、Agent连接与模型、版本、就绪状态和能力及文档链接；MUST不暴露实例管理秘密和账号凭据。能力清单 SHALL 包含列表查询优化参数、单步续聊 messages、事件补查 events 与凭据回推配置管理操作，并按凭据权限过滤。

#### Scenario: 无需浏览器发现
- **WHEN** 程序仅持有地址与Bearer凭据
- **THEN** 程序 MUST能读取发现并选择被授权的登记工作空间和连接，能力清单 MUST 反映新增的 messages、events 与回推配置操作

### Requirement: 自描述与最小示例
系统 SHALL提供HTTP文档入口与OpenAPI，包含认证、参数、权限、副作用、错误、冲突、超时恢复、轮询和发任务/查状态/读结果的可运行示例；示例 MUST从本机文件读取令牌，不打印秘密。文档 SHALL 同步覆盖事件回推、列表查询优化与单步续聊，contractVersion MUST 随契约内容变化，并给出"配置回推→收到 decision.requested→读对话→单步续聊"的最小示例。

#### Scenario: 按文档调用
- **WHEN** 本机调用方按帮助配置地址和凭据文件
- **THEN** 调用方 MUST无需阅读源码或网页认证即可发起并观察工作，并 MUST 能按最小示例完成配置回推、接收 decision.requested、读对话与单步续聊