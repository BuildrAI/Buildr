## MODIFIED Requirements

### Requirement: Runtime 投射包含 capability binding evidence
Buildr MUST 将解析后的 consumer-local capability binding 作为紧凑、受管的 runtime 派生内容提供给 Agent，MUST 将完整诊断和完整性证据保留在 Doctor 与 projection receipt，并 MUST 保持 workspace、Project 和外部 Skill 源正文不变。

#### Scenario: 投射已绑定 consumer
- **WHEN** Buildr 为声明 `requires` 的 consumer 生成 runtime Skill
- **THEN** runtime Skill MUST 只包含该 consumer 自身依赖的受管 capability binding block
- **AND** block MUST 记录 capability id、version、dependency mode、readiness、reason、contract source path、selected provider id、provider runtime path 和 provider scope
- **AND** block MUST NOT 展示 contract digest、binding provenance、其他 consumers 或完整 workspace capability graph
- **AND** block MUST 要求 Agent 在执行 provider-dependent action 前读取已解析 contract 和 selected provider

#### Scenario: Consumer projection receipt 保存完整局部证据
- **WHEN** Buildr 为包含 capability binding block 的 consumer 生成 projection receipt
- **THEN** receipt MUST 保存该 consumer 的 contract digest、binding provenance、readiness 和 resolved provider 快照及其完整性证据
- **AND** receipt MUST 位于对应 destination 的 `.buildr/agent-runtime/<destination>/<adapter>/skill-projection-ownership-receipts/`
- **AND** receipt MUST NOT 作为 runtime Skill 正文、workspace Skill source 或 Git 交付资产

#### Scenario: Doctor full 输出完整能力图
- **WHEN** Agent 需要检查全局 capability、contract digest、binding、consumer readiness、候选 provider 或修复动作
- **THEN** Agent MUST 使用当前 workspace 的 Doctor full capability graph
- **AND** Buildr MUST NOT 通过把完整图复制进产品入口或每个 consumer runtime Skill 来提供该证据

#### Scenario: Provider 源保持不变
- **WHEN** Buildr 组合 capability binding block、Skill Contribution 或其他 runtime 派生内容
- **THEN** Buildr MUST NOT 把 binding 写回 consumer 或 provider 的源 `SKILL.md`
- **AND** runtime receipt/check MUST 能够说明 binding provenance

#### Scenario: Required consumer 从 ready 变为 blocked
- **WHEN** provider 卸载、binding 失效或 runtime compatibility 变化使 required consumer 不再 capability-ready
- **THEN** render MUST 更新可证明由 Buildr 管理的 consumer runtime 副本并注入 blocked evidence
- **AND** consumer MUST 继续提供安全停止、问题解释和通过 Doctor 获取修复路径的指引
- **AND** Buildr MUST 继续投射不依赖该 capability 的其他 Skills
