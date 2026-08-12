## ADDED Requirements

### Requirement: Doctor JSON 默认提供紧凑诊断
Buildr MUST 让 `doctor --json` 默认返回紧凑、稳定且足以判断健康状态和后续动作的结构化结果，并 MUST 仅在调用方显式请求时返回完整诊断 inventory。

#### Scenario: 默认 JSON 使用 compact detail
- **WHEN** Agent 运行 `buildr doctor --target <root> --json` 且没有传入 `--detail`
- **THEN** Doctor JSON MUST 包含 schema identity、目标、scope、Agent runtime、`ok`、summary、health、findings、repair plan 和 next steps
- **AND** 默认结果 MUST NOT 包含完整 capability graph、Component ownership、Builtin inventory、Command inventory 或 runtime inventory

#### Scenario: 显式请求完整诊断
- **WHEN** Agent 运行 `buildr doctor --target <root> --json --detail full`
- **THEN** Doctor MUST 返回完整诊断 read model
- **AND** 完整结果 MUST 保持与相同检查产生的 compact 结果一致的 `ok`、summary、health、findings、repair plan 和 next steps

#### Scenario: 显式请求紧凑诊断
- **WHEN** Agent 运行 `buildr doctor --target <root> --json --detail compact`
- **THEN** Doctor MUST 返回与默认 `doctor --json` 相同的紧凑字段集合

#### Scenario: 完整结果超过进程默认缓冲区
- **WHEN** 一个健康 Workspace 的 full Doctor JSON 超过 1 MiB
- **THEN** 默认 compact Doctor JSON MUST 仍可完整输出并保持健康判定
- **AND** Buildr MUST NOT 通过截断 JSON 来缩小结果
