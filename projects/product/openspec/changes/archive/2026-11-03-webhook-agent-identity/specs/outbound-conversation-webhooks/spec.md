## ADDED Requirements

### Requirement: 统一发送方身份
每个出站 webhook JSON payload SHALL 包含 agent.name 和 agent.id。本服务发送方 SHALL 标识为 {"name":"Buildr","id":"buildr"}，与执行器、模型、账号及参与者身份分离；MUST NOT 使用顶层 agentName、agentId 或 source 作为平行身份字段。

#### Scenario: 所有事件类型
- **WHEN** 任一兼容状态事件或过程事件进入发送队列
- **THEN** 序列化 JSON 包含相同的规范发送方身份，且鉴权、秘密替换、降量和尽力投递行为保持不变
