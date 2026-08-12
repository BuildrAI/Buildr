## ADDED Requirements

### Requirement: Project 必须提供 canonical glossary 作用域
Buildr Project MUST 将 `openspec/knowledge/glossary.md` 作为默认 canonical glossary；术语条目 MUST 表达 canonical 名称、定义、适用范围、需要避免的歧义表达和来源。Service 特有术语 MAY 位于对应 `openspec/knowledge/services/<service-code>.md` 的局部术语小节，但 MUST NOT 静默重定义 Project term。

#### Scenario: 维护 Project 通用术语
- **WHEN** 一个术语适用于 Project 的多个模块、角色或 Services
- **THEN** Agent MUST 在 Project glossary 中维护该术语
- **AND** Service 文档 MUST 引用 canonical term 而不是复制一份不同定义

#### Scenario: Service 术语具有局部语义
- **WHEN** 某术语只在单个 Service 内成立或与 Project term 存在明确范围差异
- **THEN** Agent MUST 在 Service 文档中显式标注作用域和与 Project term 的关系
- **AND** 无法解释的重定义 MUST 被报告为术语冲突

#### Scenario: Task 发现新术语
- **WHEN** Task 中出现尚未确认的新词、别名或翻译
- **THEN** Agent MUST 将它作为待调查信号而不是创建 Task 专属 glossary
- **AND** 只有已确认且属于长期项目事实的术语才能进入 Project 或 Service canonical 资产

### Requirement: Buildr 必须提供术语治理能力契约
Buildr MUST 提供 `buildr.terminology-governance/v1` capability contract，并 MUST 提供默认 workspace Skill provider。Contract MUST 要求 provider 解析当前 Project、定位 canonical glossary、检查已有术语、识别同义词、一词多义、中英不一致、新术语和作用域冲突。

#### Scenario: Consumer 请求术语对齐
- **WHEN** consumer 通过 binding 使用 `buildr.terminology-governance/v1`
- **THEN** selected provider MUST 先读取 contract、Project context 和现有 canonical terms
- **AND** provider MUST NOT 依据具体 Skill id、固定命令或安装顺序推断调用关系

#### Scenario: 默认 provider 被替换
- **WHEN** workspace 绑定兼容的替代 provider
- **THEN** consumers MUST 继续依赖相同 capability guarantees 和 result evidence
- **AND** Buildr MUST NOT 要求修改 external OpenSpec Skill 源以适配 provider identity

### Requirement: 术语治理必须先调查再追问
Terminology provider MUST 自行调查可从 specs、实现、registries、已有 knowledge 和已确认 Change artifacts 中确定的事实，并 MUST 只向用户追问会改变长期语义、作用域、所有权或责任边界的决策；未确认内容 MUST NOT 写入 canonical glossary。

#### Scenario: 现有资产已能确定含义
- **WHEN** term 的定义和作用域可由权威资产一致确认
- **THEN** Agent MUST 使用调查结果完成对齐
- **AND** MUST NOT 把可自行确认的问题转交用户回答

#### Scenario: 两种定义会改变长期边界
- **WHEN** 候选定义对应不同的领域模型、责任所有权或跨 Service 语义
- **THEN** provider MUST 返回 unresolved conflict 并请求用户做必要判断
- **AND** 在确认前 MUST NOT 选择任一语义写入 canonical glossary

#### Scenario: 选择难以逆转
- **WHEN** 术语决定会固化公开模型、持久数据语义或跨团队责任边界
- **THEN** provider MUST 建议将决定记录到 design 或 ADR
- **AND** contract MUST NOT 强制固定访谈脚本或固定 ADR 工具

### Requirement: 术语治理必须返回结构化结果证据
`buildr.terminology-governance/v1` result MUST 包含 `status`、`termsConsulted`、`canonicalTerms`、`changedAssets`、`unresolvedConflicts` 和来源 identities；`status` MUST 为 `aligned`、`updated`、`unresolved` 或 `not-applicable` 之一。

#### Scenario: 术语无需修改
- **WHEN** 所有相关术语已与 canonical glossary 一致
- **THEN** provider MUST 返回 `status: aligned`
- **AND** evidence MUST 标识核对过的术语和来源 identity

#### Scenario: provider 更新术语资产
- **WHEN** 已确认的新术语或修订定义写入 canonical 资产
- **THEN** provider MUST 返回 `status: updated`
- **AND** `changedAssets` MUST 精确列出实际修改路径

#### Scenario: 存在未解决冲突
- **WHEN** provider 无法在授权和现有事实内解决术语冲突
- **THEN** provider MUST 返回 `status: unresolved` 和每个冲突的决策点
- **AND** required consumer MUST fail closed，不得把该结果描述为已对齐

