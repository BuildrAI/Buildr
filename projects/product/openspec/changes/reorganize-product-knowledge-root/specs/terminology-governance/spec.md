## MODIFIED Requirements

### Requirement: Project 必须提供 canonical glossary 作用域
Buildr Project MUST 将 `knowledge/glossary.md` 作为默认 canonical glossary；术语条目 MUST 表达 canonical 名称、定义、适用范围、需要避免的歧义表达和来源。Service 特有术语 MAY 位于对应 `knowledge/services/<service-code>.md` 的局部术语小节，但 MUST NOT 静默重定义 Project term。

#### Scenario: 维护 Project 通用术语
- **WHEN** 一个术语适用于 Project 的多个模块、角色或 Services
- **THEN** Agent MUST 在 `knowledge/glossary.md` 中维护该术语
- **AND** Service 文档 MUST 引用 canonical term 而不是复制一份不同定义

#### Scenario: Service 术语具有局部语义
- **WHEN** 某术语只在单个 Service 内成立或与 Project term 存在明确范围差异
- **THEN** Agent MUST 在 `knowledge/services/<service-code>.md` 中显式标注作用域和与 Project term 的关系
- **AND** 无法解释的重定义 MUST 被报告为术语冲突

#### Scenario: Task 发现新术语
- **WHEN** Task 中出现尚未确认的新词、别名或翻译
- **THEN** Agent MUST 将它作为待调查信号而不是创建 Task 专属 glossary
- **AND** 只有已确认且属于长期项目事实的术语才能进入 Project 或 Service canonical 资产
