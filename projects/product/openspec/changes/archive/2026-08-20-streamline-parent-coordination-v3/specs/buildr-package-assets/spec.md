## ADDED Requirements

### Requirement: Parent Coordination v3 必须原子进入全部交付入口
Buildr package MUST原子交付v3 Application、CLI、HTTP、Agent Skills、Buildr Web正式构建产物、JSON文档与验证，MUST在development checkout、npm tarball或`web-dist`任一仍引用v2时失败。

#### Scenario: 构建产品候选
- **WHEN** 维护者验证包含Parent Coordination v3的候选
- **THEN** package parity MUST证明checkout与npm CLI使用相同v3 identity和字段
- **AND** web-dist MUST来自已切换v3类型与consumer的Buildr Web源码
