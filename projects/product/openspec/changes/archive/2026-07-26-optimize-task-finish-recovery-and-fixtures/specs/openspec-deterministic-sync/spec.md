## ADDED Requirements

### Requirement: Deterministic apply必须在提交前验证完整expected Project
Buildr MUST 在替换真实canonical前，把本批次全部expected OpenSpec files投射到task-owned temporary Project surface，并使用receipt绑定的OpenSpec executable/version执行strict validation。只有expected surface验证通过且input/output digests仍匹配时才能原子提交；失败时整批MUST零写入并返回validation diagnostic与Agent fallback。

#### Scenario: 新capability缺少严格结构
- **WHEN** deterministic plan生成的新capability缺少`Purpose`、`Requirements`或其他当前strict validator要求的结构
- **THEN** apply MUST在真实canonical写入前返回blocked
- **AND** actual canonical files MUST保持不变

#### Scenario: Expected surface严格验证通过
- **WHEN**全部expected files在temporary Project中通过绑定版本的strict validation且receipt identity未变化
- **THEN** apply MUST原子提交完整批次
- **AND** result MUST记录expected digests、validator identity、duration和diagnostic reference

### Requirement: 新capability Purpose必须来自明确authority
Planner MUST只从proposal中对应New Capability的唯一非空描述取得新canonical Purpose authority，并 MUST NOT由Requirement正文、模型补写或默认模板推断语义。Purpose缺失、重复或不能形成可strict验证的expected surface时，整批plan MUST返回`semantic-resolution-required`。

#### Scenario: Proposal描述不足以形成合法Purpose
- **WHEN** new capability的proposal描述缺失、重复或导致expected strict validation失败
- **THEN** planner或apply MUST返回blocked与最小修复引用
- **AND** MUST NOT创建部分canonical capability
