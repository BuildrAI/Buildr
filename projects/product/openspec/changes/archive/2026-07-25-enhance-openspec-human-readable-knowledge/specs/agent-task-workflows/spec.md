## ADDED Requirements

### Requirement: OpenSpec workflow 必须通过能力契约组合当前认知维护
Buildr MUST 通过 capability dependencies 和 OpenSpec Component-owned Skill Contributions 将当前认知维护组合进外部 OpenSpec 1.6.0 workflow，并 MUST 保持 external `openspec-*` Skill 源可独立升级。Consumers MUST 依赖 capability identity 和 result evidence，不得依赖默认 provider Skill id 或声明静态方法调用。

#### Scenario: Explore 使用可选术语治理
- **WHEN** installed `openspec-explore` consumer 可解析 `buildr.terminology-governance/v1`
- **THEN** Agent MUST 在发现重要术语、别名或作用域冲突时读取 selected provider 并记录对齐结果
- **AND** provider 缺失时 consumer MUST 保持 degraded 可用并显式标注未治理术语

#### Scenario: Planning 和实现 consumers 使用 required 当前认知维护
- **WHEN** Buildr 声明 `openspec-propose`、`openspec-update-change`、`openspec-apply-change` 或 `openspec-sync-specs` builtin consumers
- **THEN** 每个 consumer MUST required 依赖 `buildr.current-knowledge-maintenance/v1`
- **AND** required provider 未 ready 时 consumer MUST 按现有 capability readiness fail closed

#### Scenario: Task Finish 使用 required 当前认知维护
- **WHEN** Buildr 声明 `task-finish` builtin
- **THEN** manifest MUST 将 `buildr.current-knowledge-maintenance/v1` 声明为 required dependency
- **AND** Task Finish MUST 使用 selected provider 的 inspect result，而不是在自身正文复制术语和 knowledge policy

#### Scenario: Archive 保持纯归档职责
- **WHEN** Buildr 声明 `openspec-archive-change` builtin
- **THEN** archive consumer MUST NOT 为归档后 knowledge 或 glossary 写入声明直接 dependency
- **AND** archive MUST 只移动已完成前置对齐的 Change

#### Scenario: OpenSpec Component 更新或卸载
- **WHEN** Buildr 更新或卸载 OpenSpec Component 并重新 render runtime
- **THEN** Buildr-owned contributions MUST 按 Component lifecycle 更新或移除
- **AND** external OpenSpec Skill source bytes MUST 保持与受支持上游版本一致
- **AND** dependency readiness MUST 通过 workspace manifest 和 runtime binding evidence 表达

### Requirement: Change lifecycle 必须在最终验证前收敛 Brief 与当前认知
Buildr OpenSpec workflow MUST 在 propose/update 阶段 assess，在 apply 阶段执行真实维护任务并 reconcile，在 sync 和 Task Finish 阶段检查 evidence；所有可能修改 delivery content 的 reconcile MUST 在对应最终验证之前完成。OpenSpec archive 后 MUST NOT 再维护 glossary 或 current knowledge。

#### Scenario: Propose 创建人类入口与影响任务
- **WHEN** `openspec-propose` 完成 proposal、design、specs 和 tasks
- **THEN** Agent MUST 使用 selected current-knowledge provider 创建或更新 Brief 并运行 assess
- **AND** assess 识别的真实维护目标 MUST 进入 tasks 和 knowledge-impact evidence
- **AND** 无真实影响的目标 MUST NOT 产生空文档任务

#### Scenario: Update 修订 planning artifacts
- **WHEN** `openspec-update-change` 修改 scope、流程、影响、验收或 delta requirements
- **THEN** Agent MUST 更新 Brief 并重新运行 assess
- **AND** tasks 和 knowledge-impact evidence MUST 与修订后的 planning artifacts 保持一致

#### Scenario: Apply 发现并处理当前认知影响
- **WHEN** `openspec-apply-change` 实现 Change tasks
- **THEN** Agent MUST 执行已识别的 Brief、knowledge 和 terminology tasks，并把实现中新发现的真实影响加入 tasks/evidence
- **AND** implementation content 完成后 MUST 运行 reconcile，再进入最终 verification

#### Scenario: Sync 前核对 reconcile evidence
- **WHEN** `openspec-sync-specs` 准备把 delta specs 同步到 canonical specs
- **THEN** Agent MUST 核对 reconcile result 对应当前 Change、canonical candidate 和 delivery tree identity
- **AND** evidence 缺失、陈旧或 unresolved 时 MUST 停止 sync 并报告 next actions

#### Scenario: Archive 不补写当前认知
- **WHEN** Change 已完成 sync、verification、current-knowledge inspect 并准备 archive
- **THEN** archive MUST 只移动 Change 及其 companion/sidecar artifacts
- **AND** archive 完成后 MUST NOT 触发 glossary、overview、architecture、flows 或 services 写入

### Requirement: Task Finish 必须把当前认知检查作为验证前门禁
Task Finish MUST 在把 implementation tree 交给 selected task-verification provider 前，调用 selected `buildr.current-knowledge-maintenance/v1` provider 执行 inspect。只有 assess impacts 已处理、Brief 与权威 artifacts 一致、current knowledge 对应最终 tree 且 terminology 没有 unresolved conflict 时，Task Finish 才能继续所需 assurance、spec sync、archive 和 integration。

#### Scenario: Inspect 确认已对齐且不修改内容
- **WHEN** provider 返回 aligned result 且 source identities 匹配当前 tree
- **THEN** Task Finish MUST 记录 evidence 并继续既有 requiredAssurance 流程
- **AND** inspection MUST NOT 被计作 task-verification provider execution

#### Scenario: Fallback reconcile 修改 delivery content
- **WHEN** inspect 发现可在当前授权内修复的问题并由 provider reconcile 修改 Brief、knowledge、spec 或其他 delivery content
- **THEN** Task Finish MUST 将 transition 归类为 `implementation-changed`
- **AND** 任何旧 verification evidence MUST 失效
- **AND** Task Finish MUST 对更新后的最终 tree 重新执行所需 assurance

#### Scenario: Inspect 返回 unresolved
- **WHEN** provider 返回未处理 impact、事实冲突、Brief 漂移或 unresolved terminology
- **THEN** Task Finish MUST 停止 verification、sync、archive、Git integration、push 和 cleanup
- **AND** 最终状态 MUST 报告实际冲突、受影响资产和可执行下一步

#### Scenario: Archive 后发现知识问题
- **WHEN** archive 后检查发现历史 Change 或 current knowledge 存在需要修订的问题
- **THEN** Agent MUST 保持 archive 不变并创建或路由后续任务处理当前事实
- **AND** MUST NOT 在 archive 阶段回写已归档 Change 或隐式修改 knowledge
