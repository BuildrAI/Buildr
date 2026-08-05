## ADDED Requirements

### Requirement: OpenSpec 直接 consumers 必须表达真实 capability 停止条件
Buildr OpenSpec Component MUST通过结构化 dependency contributions 与对应 fragments 统一声明直接和条件依赖，使直接命中外部 OpenSpec Skill 的正式持久交付仍满足 Task、Environment、Development 与 current knowledge 边界。

#### Scenario: 直接调用 propose
- **WHEN**用户意图直接命中 `openspec-propose` 并准备创建 Change artifacts
- **THEN** consumer MUST required依赖 `buildr.task-record/v1`、`buildr.task-environment/v1`、`buildr.task-development@2` 与 `buildr.current-knowledge-maintenance/v1`
- **AND** Environment MAY选择共享执行根但 MUST返回 matching ready evidence

#### Scenario: 直接调用 apply
- **WHEN**用户意图直接命中 `openspec-apply-change` 并准备修改实现或 Change tasks
- **THEN** consumer MUST required依赖 Task Record、Task Environment、Task Development 与 current knowledge capabilities
- **AND**任一 provider 未 ready 或 Task/Environment/Development context 不匹配时 MUST在实现编辑前停止

#### Scenario: 纯 planning update
- **WHEN** `openspec-update-change` 只修订既有 planning artifacts且不产生新的执行效果
- **THEN** current knowledge dependency MUST为 required，Task Environment与Task Development dependencies MUST为 optional
- **AND**若修订发生在正式 Task 中，Development provider ready时 MUST更新planning snapshot

#### Scenario: Update 产生执行效果
- **WHEN** update 需要新的实现、构建、测试、资源或执行位置变化
- **THEN** fragment MUST要求 Environment和Development provider ready并转入`openspec-apply-change`
- **AND**不得在 update consumer 中继续实现或把 optional dependency 当作绕过理由

### Requirement: OpenSpec apply、sync 和 archive 必须使用单一 convergence authority
Buildr MUST在 apply 入口执行 apply-ready 和 proposal/delta 门禁，并 MUST让独立 sync/archive consumers 拒绝 canonical 写入或归档旁路，统一转交 `buildr openspec converge`。

#### Scenario: Apply 开始实现
- **WHEN** `openspec-apply-change` 准备进行首个实现编辑
- **THEN** prepend MUST验证 apply-required artifacts complete、上游 strict validation 与 proposal/delta classification check
- **AND**门禁未通过时 MUST blocked，delta Requirement identity改变后 MUST重新检查

#### Scenario: 用户直接调用 sync
- **WHEN**用户要求 `openspec-sync-specs` 在 Buildr Workspace 写入 canonical specs
- **THEN** prepend MUST拒绝上游 agent-driven sync并转用 `buildr openspec converge`
- **AND** sync consumer MUST NOT机械声明完整Task lifecycle dependencies或运行旧pre-sync/post-sync序列

#### Scenario: 用户直接调用 archive
- **WHEN**用户要求 `openspec-archive-change` 跳过未完成tasks、spec sync或convergence直接归档
- **THEN** prepend MUST拒绝确认绕过并转用 `buildr openspec converge`
- **AND**只有converge返回passed或幂等archived结果时才 MUST报告canonical sync/archive完成

## REMOVED Requirements

### Requirement: Buildr 通过声明式 Skill Contribution 编排 OpenSpec 契约门禁
**Reason**: 该要求把 apply-ready gate 固定在 `task-triage#change-ready`，并保留已退役的 baseline 与 Task Finish pre/post-sync authority，与当前直接 consumer 路由和单一 converge 事务冲突。
**Migration**: 使用本 Change 新增的“OpenSpec 直接 consumers 必须表达真实 capability 停止条件”和“OpenSpec apply、sync 和 archive 必须使用单一 convergence authority”。

### Requirement: OpenSpec apply 保持 canonical specs 直到受控同步阶段
**Reason**: 该要求仍描述 agent-driven sync、pre-sync/post-sync receipts 与 Task Finish 同步阶段，已被产品确定性 `buildr openspec converge` 事务取代。
**Migration**: apply 只完成实现、knowledge reconcile与Change checklist；canonical sync/archive由单一 converge 事务完成。
