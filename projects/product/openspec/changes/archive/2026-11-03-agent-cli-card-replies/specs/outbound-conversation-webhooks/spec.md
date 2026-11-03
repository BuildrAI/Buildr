## MODIFIED Requirements

### Requirement: 可选单向状态通知
服务 SHALL 仅发送 task_started、status_changed、reply、pending_question、pending_approval、completed、error 七类公共事件。每条 MUST 带 eventId、conversationId、agent.name、agent.id、machine、eventType、summary、timestamp，其余附加字段由接收端原样转发。采用 Bearer 鉴权，秘密、内部思考和原始工具输入输出 MUST NOT 外发。

#### Scenario: 消息更新
- **WHEN** 回复流式更新或本轮回复完成
- **THEN** 流式片段不推；完成时仅推 reply 元数据，不含完整回复正文，接收端通过 read 获取正文。

#### Scenario: 状态事件
- **WHEN** 新问题卡片、待审批、完成或错误被发布
- **THEN** 相应事件立即持久入队，不等待回复全文；问题卡片含准确 ID 和问题选项，审批命令不外发，关闭卡片不代表回答或同意。

#### Scenario: 独立状态与回复事件
- **WHEN** 任一厂商的原生执行产生相同统一状态
- **THEN** 使用同一套公共事件名称及 envelope，不发送 conversation_updated。

#### Scenario: 未配置
- **WHEN** Webhook 配置缺失或无效
- **THEN** 不发送通知，对话行为保持不变。

#### Scenario: 完整过程
- **WHEN** 执行或工具状态、待发送或卡片集合发生语义变化
- **THEN** 发送轻量 status_changed 事件，不发送流式正文，卡片关闭保留准确身份，不推断同意。

### Requirement: 隔离及有界尽力发送
服务 MUST 隔离网络失败并持久保存事件与投递状态，禁止重定向，每次请求5秒超时、并发最多16。未确认事件 MUST 保留原 eventId 指数退避重试，初始1秒、上限5分钟，重启后自动补推；仅2xx确认成功，发送端负责发布去重、重试及补推，不要求接收端判断业务。成功事件 MUST 保留供按 eventId 显式重放。网络响应丢失允许相同 eventId 重复到达，不承诺恰好一次。

#### Scenario: 重复发布
- **WHEN** 同一语义快照重复发布或服务重启后再次观察
- **THEN** 持久去重，不产生第二个业务事件；尚未投递的事件继续补推。

#### Scenario: 发送失败
- **WHEN** 接收端非2xx、断线、请求超时或积压超过原内存容量
- **THEN** 保留持久事件，退避后以原 eventId 重试，不丢弃事件、不重做原业务动作。

#### Scenario: 显式重放
- **WHEN** 用户按 eventId 请求重放准确空间与对话中的事件
- **THEN** 重放原 envelope，保留 eventId、timestamp 和附加字段；错误作用域、未知事件或不同配置目标拒绝。

### Requirement: 统一发送方身份
每个 payload SHALL 包含并列的 agent 与 machine。agent.name SHALL 为 Buildr，agent.id MUST 在本实例数据根首次生成并持久保存，独立于厂商/模型/代次；不同实例目录 MUST 获得不同 ID。machine SHALL 使用 Buildr 所在机器主机名。

#### Scenario: 所有事件类型
- **WHEN** 同一实例重启或两个独立 Buildr 实例发送事件
- **THEN** 同一实例 id 不变，不同实例 id 不同，machine 为真实主机名，所有七类事件均包含必填字段。
