# agent-cli Specification

## Purpose
提供可由人或智能体组合使用的本机 Agent service 对话命令行入口，复用既有 HTTP 接口、工作空间身份和执行控制，不创建第二套执行引擎或任务状态。

## Requirements

### Requirement: 六命令客户端
系统 SHALL 提供 `agent send <message>`、`agent read <conversation-id>`、`agent stop <conversation-id>`、`agent list`、`agent reply <conversation-id> <request-id> [<message> | --option <question-id=option-id> | --other <question-id=text> | --answer-json <json>]`、`agent continue <conversation-id> <message>`，以及 `agent supplement <conversation-id> <message>`、`agent replay <conversation-id> <event-id>`。所有命令 MUST 使用当前配置的本机既有 HTTP 接口，不修改任务数据、不创建外部令牌或对外控制接口。

#### Scenario: 发送新消息
- **WHEN** 用户发送非空消息并确定可用连接
- **THEN** 未指定已有对话时，客户端依次调用 create、prepare-send、send，使用预发送返回的令牌与版本，输出包含新对话标识的结果。

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
- **THEN** 客户端先 observe，以请求自身的 runId、participantId、generation 和对话当前 expectedRevision 调用 reply，文本模式原样发送；结构化模式提交以问题 ID 为键、选项 ID 或自由文本数组为值的 answer。各模式互斥，客户端 MUST 核对问题及选项 ID、完整回答、单选/多选与 allowOther，不以标签或序号猜测答案，不推断同意；不存在、已处理或冲突时报错且不重试。

#### Scenario: 继续已有对话
- **WHEN** 用户向已有空闲对话发送新消息
- **THEN** 客户端先 observe，沿用原参与者连接、模型和执行配置完成 prepare-send 和 send，不调用 create；活动或未知执行、未结束保留执行、待处理问题及排队消息均明确报错，不静默改用 supplement 或 pending-send。

#### Scenario: 工作空间身份与中文交互
- **WHEN** 任一命令接收缺失或无效的工作空间身份
- **THEN** 在 HTTP 操作前拒绝执行；用户帮助、列表和本地诊断均使用中文，协议字段及服务返回值保持原样。

#### Scenario: 结构化卡片回答
- **WHEN** 用户以重复 --option q=a、--other q=text 或 --answer-json '{"q":["a"]}' 提交问题卡片回答
- **THEN** 客户端 SHALL 先 observe 并校验当前问题，使用请求自身执行身份与当前版本提交结构化 answer；无效 JSON、未知 ID、漏答、重复选择、不允许的自由文本及单选多值 MUST 在 reply 写入前拒绝。

#### Scenario: 放弃卡片并在同一对话发送新内容
- **WHEN** 用户执行 agent send <message> --conversation <id> --skip-questions
- **THEN** 客户端 SHALL 观察该 conversationId，沿用当前连接、账号、模型及执行配置，以 waitingHandoff.intent=new-turn、当前原执行身份、完整问题 ID 集合完成预览和持久投递，不创建对话、不 reply、不写任务数据。服务 MUST 保留历史并记录旧问题未回答，由现有机制清理原执行；新内容不构成旧问题答案或授权。

#### Scenario: 跳过问题的边界
- **WHEN** 缺少任一配套参数、混用连接/模型/权限覆盖、原执行不在等待问题、含审批、问题集合或版本变化、已有待发送内容或投递失败
- **THEN** 系统 MUST 拒绝相关操作并保留现有内容，不退化为新建对话或自动重试未知投递。

#### Scenario: 自动选择唯一就绪连接
- **WHEN** 用户执行未指定已有对话的 send
- **THEN** 系统 MUST 只自动选择唯一同时 enabled 且 ready 的连接；零个或多个时在创建对话前报错提示。--connection MUST 作为未知参数拒绝，不提示通过此参数选择连接。

#### Scenario: 运行中补充
- **WHEN** 用户执行 agent supplement <conversation-id> <message>
- **THEN** CLI MUST 观察原轮，以当前 runId、participantId、generation、新 clientRequestId 及 sameRunOnly=true 调用 supplement，沿用原连接，不创建对话、不回复卡片、不自动重试或改成 send；原轮不可补充则报错，投递途中原轮结束则返回未投递，不自动开启新轮。

#### Scenario: 按事件重放
- **WHEN** 用户执行 agent replay <conversation-id> <event-id>
- **THEN** CLI MUST 通过本机 webhook-replay 对准确空间及对话重放已保存事件，eventId 和 payload 保持不变；不存在或跨作用域事件拒绝，不执行模型输入。
