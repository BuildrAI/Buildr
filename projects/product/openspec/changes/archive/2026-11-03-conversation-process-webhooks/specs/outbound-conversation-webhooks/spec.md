## MODIFIED Requirements

### Requirement: 可选单向状态通知
服务 SHALL 在配置有效的 URL 和密钥后，对 completed、error、pending_question、pending_approval 发送兼容 POST JSON，并对每次统一对话视图发布发送 conversation_updated，包含 conversationId、workspaceId、eventType、summary、timestamp、eventId、revision、generation、sequence 及安全的过程增量；SHALL 使用 Authorization Bearer，不记录秘密，不增加入站控制。

#### Scenario: 未配置
- **WHEN** 配置缺失或无效
- **THEN** 不发送通知且对话行为保持不变

#### Scenario: 完整过程
- **WHEN** 开始、运行、工具活动、等待回答、回答后继续、停止或任意其他运行/对话视图变化发布
- **THEN** 每个不同发布版本产生过程事件，包含运行状态与控制事实、待回应卡片快照及已关闭卡片身份，不把关闭卡片推断为同意

#### Scenario: 消息更新
- **WHEN** 用户目标或助手回复新增或更新
- **THEN** 过程事件携带新增或更新消息正文与身份、状态，排除内部思考与原始工具输入输出，并替换已知 webhook 配置秘密；首次观察不补发启动前历史正文

#### Scenario: 状态事件
- **WHEN** 发布完成、失败或新的问题/审批请求
- **THEN** 保留四类旧事件与稳定身份，新增问题卡片内容在过程事件中发送，审批正文不外发

### Requirement: 隔离及有界尽力发送
服务 MUST 隔离网络失败，禁止重定向，5 秒超时，并发最多 16、等待队列最多 512 且总正文不超过 16 MiB；不自动重试，同进程最近 10000 个事件 ID 不重复发送，关闭时取消请求并清空待发送队列。

#### Scenario: 重复发布
- **WHEN** 同一对话视图快照或旧事件身份重复发布且 ID 仍在缓存
- **THEN** 只尝试发送一次

#### Scenario: 发送失败
- **WHEN** 接收端失败、超时或等待队列已满
- **THEN** 不影响对话且不自动重试

## ADDED Requirements

### Requirement: 单一私有配置
服务 SHALL 优先读取 BUILDR_AGENT_WEBHOOK_CONFIG 指定的单一 JSON 文件，未指定时读取宿主主目录 ~/.buildr-webhook.json，其中包含 url 和 secret；仅在默认文件不存在时兼容旧环境变量。存在但无效的文件 MUST 禁用发送，不回退到其他地址。

#### Scenario: 私有文件
- **WHEN** 当前用户所有的私有普通文件包含有效地址与秘密
- **THEN** 所有事件使用该地址及密钥，拒绝链接、非私有权限或无效内容，不把内容写入日志

#### Scenario: 配置不可用
- **WHEN** 显式文件缺失或任一文件无效
- **THEN** 隔离失败且禁用发送，不输出配置或错误详情
