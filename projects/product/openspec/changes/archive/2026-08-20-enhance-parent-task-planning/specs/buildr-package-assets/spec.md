## ADDED Requirements

### Requirement: Parent Plan v2 必须在产品包中一致交付
Buildr package MUST 原子交付 Parent Plan v2 Domain/Application/CLI JSON contract、Task workflow guidance、Buildr Web 正式构建产物与对应验证。Package/current workspace/candidate 三种入口的 schema、状态语义或 Web assets 不一致时 package check 或适用验证 MUST fail closed。

#### Scenario: package asset 一致性
- **WHEN** 维护者构建包含 Parent Plan v2 的候选包
- **THEN** package 中的 CLI schema/example、workflow 指引与 `web-dist` MUST 对 expected/actual binding 使用同一语义
- **AND** package verification MUST 检测遗漏或旧 v1 writer 指引

