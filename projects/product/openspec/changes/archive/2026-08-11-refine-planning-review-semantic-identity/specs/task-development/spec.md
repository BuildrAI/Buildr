## ADDED Requirements

### Requirement: OpenSpec planning target 必须使用语义身份
Task Development consumer为OpenSpec planning登记target时 MUST使用Task Planning Identity Application返回的aggregate identity与artifact semantic nodes。Development Receipt继续只保存opaque target、最小node authority/reference/content identity/disposition/summary；MUST NOT保存semantic projection正文或自行解析Markdown。

#### Scenario: 仅执行进度或provenance改变
- **WHEN** resolver证明OpenSpec semantic target未变，但planning node的物理active/archive provenance或checklist完成事实发生变化
- **THEN** consumer MUST保持相同Planning Review target
- **AND** Development MUST NOT仅因此要求新的Planning Review Result

#### Scenario: resolver target变化或blocked
- **WHEN** resolver返回不同target或blocked diagnostic
- **THEN** consumer MUST分别把已有Planning Review视为stale或停止Development推进
- **AND** MUST NOT以旧target、raw artifact digest或手工摘要满足planning gate

