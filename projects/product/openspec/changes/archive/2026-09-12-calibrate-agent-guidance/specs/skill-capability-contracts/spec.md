## MODIFIED Requirements

### Requirement: Agent 根据工作意图执行工作能力适配
Buildr MUST 将用户工作意图作为 Agent 工作能力适配的入口，并 MUST NOT 要求普通用户识别或手动维护 capability contract、provider、consumer 或 binding。

#### Scenario: 用户表达工作方式变化
- **WHEN** 用户要求采用内部流程、调整默认工作方式、修改 Skill 行为或替换某项专业动作
- **THEN** Agent MUST 先判断该意图是否触达或产生跨 Skill 稳定依赖边界
- **AND** 仅当变化涉及跨技能协作、能力声明、绑定或激活时，Agent MUST 检查相关 Skill 的 `provides`、`requires`、当前 binding、routing evidence 和受影响 consumers；内部文字或操作说明整理不要求完整依赖诊断
- **AND** Agent MUST NOT 把底层 manifest 或 binding 操作作为默认结果要求用户完成

#### Scenario: 变化只属于单个 Skill 内部
- **WHEN** 目标行为不被其他 Skill 组合、不需要替换实现、consumer 不依赖其稳定保证或结果证据，且修改或卸载无需跨 Skill 影响诊断
- **THEN** Agent MUST 将其作为普通 Skill 维护
- **AND** Agent MUST NOT 为形式完整创建空洞 capability contract

#### Scenario: 变化触达已有 contract
- **WHEN** 用户意图修改已有 provider 且目标行为仍处于 contract `Allowed Variations` 内
- **THEN** Agent MUST 在保持 contract identity 和 guarantees 的前提下修改候选 provider
- **AND** Agent MUST 验证所有受影响 consumers 后再激活
- **AND** Agent MUST NOT 要求用户了解这些 consumers

#### Scenario: 变化产生新的跨 Skill 边界
- **WHEN** 另一 Skill 需要调用或编排该行为、需要替换实现、依赖稳定保证或结果证据，或生命周期需要影响诊断
- **THEN** Agent MUST 评估并创建最小 capability contract、provider 和 consumer declarations
- **AND** contract MUST 只包含 consumer 无法安全继续时真正依赖的行为

#### Scenario: 候选适配失败
- **WHEN** 候选 provider 不满足 contract、组合验证失败或激活计划会产生未接受的 blocked consumers
- **THEN** Agent MUST 保留当前有效实现和 binding
- **AND** Agent MUST 报告失败证据、受影响能力和需要用户决定的语义差异
