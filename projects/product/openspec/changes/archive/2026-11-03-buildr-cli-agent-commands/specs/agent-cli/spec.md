## Purpose
提供可由人或智能体组合使用的本机 Agent service 对话命令行入口，复用既有 HTTP 接口、工作空间身份和执行控制，不创建第二套执行引擎或任务状态。

## ADDED Requirements
### Requirement: 六命令客户端
系统 SHALL 提供恰好 `agent send <message>`、`agent read <conversation-id>`、`agent stop <conversation-id>`、`agent list`、`agent reply <conversation-id> <request-id> <message>`、`agent continue <conversation-id> <message>` 六个命令。所有命令 MUST 使用当前配置的本机既有 HTTP 接口，不修改任务数据、不创建外部令牌或对外控制接口。

#### Scenario: 发送新消息
- **WHEN** 用户发送非空消息并确定可用连接
- **THEN** 客户端依次调用 create、prepare-send、send，使用预发送返回的令牌与版本，输出包含新对话标识的结果。

#### Scenario: 读取进展
- **WHEN** 用户读取指定对话
- **THEN** 客户端使用 read 或 entries 和 observe 返回当前状态、进展与分页信息，不标记已读、不回复问题。

#### Scenario: 停止原执行
- **WHEN** 用户停止指定对话
- **THEN** 客户端先观察，再以原执行 runId、participantId、generation 和 expectedRevision 调用 stop；无执行时不发停止请求，冲突时不重放。

#### Scenario: 失败与本机边界
- **WHEN** 实例不可用、非回环地址、连接不确定或 HTTP 失败
- **THEN** 客户端报错，不自动启动引擎、不跟随重定向、不重试未知发送，不输出认证信息；已创建对话标识保留在错误中。


#### Scenario: 列出工作空间对话
- **WHEN** 用户执行 list 并可选指定 query 和每页 limit
- **THEN** 客户端只调用 conversations HTTP 接口，包含隐藏对话并遍历所有分页，遵循服务端空白对话排除规则；默认中文显示标题、状态和最后更新时间，支持 JSON 输出，不读取数据库。

#### Scenario: 正式回复待处理请求
- **WHEN** 用户给出对话标识、待处理请求标识和明确回答文本
- **THEN** 客户端先 observe，以请求自身的 runId、participantId、generation 和对话当前 expectedRevision 调用 reply，原样发送文本，不推断同意；不存在、已处理或冲突时报错且不重试。

#### Scenario: 继续已有对话
- **WHEN** 用户向已有空闲对话发送新消息
- **THEN** 客户端先 observe，沿用原参与者连接、模型和执行配置完成 prepare-send 和 send，不调用 create；活动或未知执行、未结束保留执行、待处理问题及排队消息均明确报错，不静默改用 supplement 或 pending-send。

#### Scenario: 工作空间身份与中文交互
- **WHEN** 任一命令接收缺失或无效的工作空间身份
- **THEN** 在 HTTP 操作前拒绝执行；用户帮助、列表和本地诊断均使用中文，协议字段及服务返回值保持原样。
