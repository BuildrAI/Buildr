## MODIFIED Requirements

### Requirement: 可选单向状态通知
服务 SHALL 在配置有效的 URL 和密钥后，对 completed、error、pending_question、pending_approval 发送兼容 POST JSON，并对有意义的统一对话状态变化发送 conversation_updated，并提供 task_started、status_changed、reply 分类事件，包含 conversationId、workspaceId、eventType、summary、timestamp、eventId、revision、generation、sequence 及安全的过程增量；SHALL 使用 Authorization Bearer，不记录秘密，不增加入站控制。

#### Scenario: 未配置
- **WHEN** 配置缺失或无效
- **THEN** 不发送通知且对话行为保持不变

#### Scenario: 完整过程
- **WHEN** 开始、运行、工具活动、等待回答、回答后继续、停止或任意其他运行/对话视图变化发布
- **THEN** 每个不同语义状态产生过程事件；纯版本、更新时间及未完成回复的正文片段变化 MUST NOT 触发推送，包含运行状态与控制事实、待回应卡片快照及已关闭卡片身份，不把关闭卡片推断为同意

#### Scenario: 消息更新
- **WHEN** 用户目标新增或更新，或助手回复完成（显式完成或所属执行终止）
- **THEN** 过程事件携带新增或更新消息正文与身份、状态，排除内部思考与原始工具输入输出，并替换已知 webhook 配置秘密；首次观察不补发启动前历史正文

#### Scenario: 状态事件
- **WHEN** 发布完成、失败或新的问题/审批请求
- **THEN** 保留四类旧事件与稳定身份，新增问题卡片内容在过程事件中发送，审批正文不外发

#### Scenario: 独立状态与回复事件
- **WHEN** 新执行开始、运行或工具状态变化、助手回复完成
- **THEN** 分别发送 task_started、status_changed、reply，状态事件不包含流式正文；首次观察已有执行不推断为新启动
