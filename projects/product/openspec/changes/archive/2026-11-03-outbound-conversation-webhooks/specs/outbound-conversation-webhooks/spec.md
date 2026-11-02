## ADDED Requirements

### Requirement: 可选单向状态通知
服务 SHALL 在配置有效的 URL 和密钥后，对 completed、error、pending_question、pending_approval 发送 POST JSON，包含 conversationId、workspaceId、eventType、summary、timestamp 与 eventId；SHALL 使用 Authorization Bearer 发送密钥，不记录秘密，不增加入站控制。

#### Scenario: 未配置
- **WHEN** 任一配置缺失或无效
- **THEN** 不发送通知且对话行为保持不变

#### Scenario: 状态事件
- **WHEN** 统一视图发布完成、失败或新的待回答/待审批请求
- **THEN** 对相应运行终态或请求生成通知，摘要不包含对话正文或原始错误

### Requirement: 隔离及有界尽力发送
服务 MUST 隔离网络失败，禁止重定向，5 秒超时，并发最多 16；不自动重试，同进程最近 10000 个事件 ID 不重复发送，关闭时取消请求。

#### Scenario: 重复发布
- **WHEN** 同一运行终态或同一请求重复发布且 ID 仍在缓存
- **THEN** 只尝试发送一次

#### Scenario: 发送失败
- **WHEN** 接收端失败、超时或容量已满
- **THEN** 不影响对话且不自动重试
