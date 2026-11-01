## ADDED Requirements

### Requirement: Responses 客户端必须能读到上游明文思考

模型网关在把上游 chat-completions 的可读推理文本（`reasoning_content`）翻译成 Responses 协议时，MUST 同时输出 `summary` 文本与不透明恢复载荷 `encrypted_content`，MUST NOT 只保留加密载荷而把可读文本整体藏起来。Responses 客户端因此 MUST 能从 `item.summary` 取得思考文本，并按自身展示策略使用；Buildr 对话不展示该文本不构成省略它的理由。上游只返回推理签名、没有明文时，摘要 MUST 保持为空，MUST NOT 编造或改写思考内容。重放 Responses 输入时 MUST 继续接受该不透明载荷并还原同一推理事实，签名绑定与来源校验 MUST 与改动前一致。

#### Scenario: chat-completions 上游带明文思考
- **WHEN** 上游返回 `reasoning_content` 文本，DSH 以 Responses 协议请求同一模型
- **THEN** 响应中的 reasoning 条目 MUST 带非空 `summary` 文本
- **AND** `encrypted_content` MUST 仍可用于下一轮重放

#### Scenario: 只有签名的推理
- **WHEN** 上游只返回推理签名而没有可读文本
- **THEN** reasoning 条目的 `summary` MUST 为空
- **AND** 重放 MUST 仍按该签名还原同一条推理事实
