## ADDED Requirements

### Requirement: ChatGPT API 模型必须表达官方确认的能力与统一显示名

ChatGPT API 来源 MUST 使用 OpenAI 官方模型页等可核对来源补充已知模型的显示名、输入模态、工具、上下文窗口、最大输出和推理档位；模型 id 与带日期快照 id MUST 归一为基础模型能力，底层调用 id MUST 保持服务商返回的原值。无法从官方来源确认的模型 MUST 继续保守表达，MUST NOT 从静态目录推断账号当前权益或可用性。

#### Scenario: 读取 gpt-6.1-sol

- **WHEN** OpenAI 模型目录返回 `gpt-6.1-sol`
- **THEN** 系统 MUST 显示 `GPT-6.1-Sol`，并表达图片输入、工具调用、1,050,000 上下文和 `low`、`medium`（默认）、`high`、`xhigh`、`max` 推理档位
- **AND** 系统 MUST NOT 声称该模型支持官方页面明确列为不支持的视频输入；视频画面仍按图片帧处理

#### Scenario: 读取带日期快照

- **WHEN** 模型目录返回 `gpt-5.4-mini-2026-03-17`
- **THEN** 显示名与能力 MUST 按基础模型 `gpt-5.4-mini` 表达
- **AND** 推理请求中的模型 id MUST 仍使用服务商返回的 `gpt-5.4-mini-2026-03-17`

#### Scenario: 未知文本模型

- **WHEN** 模型目录返回没有官方能力记录的文本模型
- **THEN** 系统 MUST 保留真实 id、文本与工具保守能力，MUST NOT 伪造图片、上下文窗口或推理档位

### Requirement: ChatGPT API 目录必须只提供 Responses 文本对话模型

ChatGPT API 来源 MUST 排除嵌入、语音、转写、实时、图片生成、视频、审核以及仅用于搜索或实时语音的模型。过滤 MUST 基于服务商返回的真实 id 与官方用途，MUST NOT 为了保持数量而把不受 Responses 支持的模型作为可执行候选。

#### Scenario: 排除实时与搜索模型

- **WHEN** 模型目录返回 `gpt-live-1` 或 `gpt-5-search-api`
- **THEN** 系统 MUST NOT 把它们加入文本对话模型候选

#### Scenario: 保留 Responses 文本模型

- **WHEN** 模型目录返回官方页面声明支持 Responses 的 GPT、o 系列或 codex 文本模型
- **THEN** 系统 MUST 保留该模型作为候选，同时继续过滤明确的非对话模型
