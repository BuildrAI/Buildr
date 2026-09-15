## MODIFIED Requirements

### Requirement: task-triage 必须通过条件能力依赖交接专业动作
`task-triage` MUST optional 依赖 `buildr.current-knowledge-maintenance/v3` 和 `buildr.task-worktree-lifecycle/v2`，并 MUST 只在相应决策分支执行前读取 contract 与 selected provider；任何 provider 不 ready MUST 只阻塞或降级对应分支，不得使无关 triage 结论不可用。

#### Scenario: Implementation 分支缺少 worktree provider
- **WHEN** triage 已确认 `implementation` 但 `buildr.task-worktree-lifecycle/v2` 未 ready
- **THEN** execution 分支 MUST fail closed 并报告 capability readiness 与 next action
- **AND** semantic decision MUST 保持可见

#### Scenario: 当前事实 maintain provider 不可用
- **WHEN** triage 选择独立 `spec-maintenance` 但 `buildr.current-knowledge-maintenance/v3` 未 ready
- **THEN** current knowledge 写入 MUST 停止
- **AND** triage MUST NOT 回退为无 evidence 的直接文档编辑或伪造 Change

#### Scenario: Verification provider 暂时不可用
- **WHEN** triage 只为实现任务规划验证节点
- **THEN** triage MUST NOT 因 `buildr.task-verification/v2` 暂时不可用而阻塞语义和位置判断
- **AND** 实际验证开始前仍 MUST 由相应 consumer 解析 selected verification provider

### Requirement: Change lifecycle 必须在最终验证前收敛 Brief 与当前认知
Buildr OpenSpec workflow MUST 通过 v3 在 propose/update 阶段按真实范围 assess，在 apply 阶段完成已授权知识任务并 reconcile；最终依据 MUST 对应真实成果。智能体（Agent）MUST 只更新被内容或运行条件变化实际影响的检查，不把固定调用顺序或辅助记录作为验证、归档或收尾的全局门禁。归档动作 MUST NOT 附带知识写入，后续独立维护仍按当前事实与授权进行。

#### Scenario: Propose 创建人类入口与影响任务
- **WHEN** `openspec-propose` 完成 proposal、design、specs 和 tasks
- **THEN** Agent MUST 使用 selected current-knowledge provider 创建或更新 Brief 并运行 assess
- **AND** assess 识别的真实维护目标 MUST 进入 tasks 及已采用的 knowledge-impact evidence
- **AND** 无真实影响的目标 MUST NOT 产生空文档任务

#### Scenario: Update 修订 planning artifacts
- **WHEN** `openspec-update-change` 修改 scope、流程、影响、验收或 delta requirements
- **THEN** Agent MUST 更新 Brief 并重新运行 assess
- **AND** tasks 及已采用的 knowledge-impact evidence MUST 与修订后的 planning artifacts 保持一致

#### Scenario: Apply 发现并处理当前认知影响
- **WHEN** `openspec-apply-change` 实现 Change tasks
- **THEN** Agent MUST 执行已识别的 Brief、knowledge 和 terminology tasks，并把实现中新发现的真实影响加入 tasks 及已采用的 evidence
- **AND** implementation content 完成后 MUST 运行 reconcile，再进入最终 verification

#### Scenario: Sync 前核对 reconcile evidence
- **WHEN** `openspec-sync-specs` 准备把 delta specs 同步到 canonical specs
- **THEN** Agent MUST 核对 reconcile result 对应当前 Change、canonical candidate 和 delivery tree identity
- **AND** 辅助 evidence 缺失或陈旧时 MUST 直接核对当前事实并报告局部缺口；只有真实语义冲突会使规范同步错误时 MUST 停止相关 sync

#### Scenario: Archive 不补写当前认知
- **WHEN** Change 已完成 sync、verification、current-knowledge inspect 并准备 archive
- **THEN** archive MUST 只移动 Change 及其 companion/sidecar artifacts
- **AND** archive 动作 MUST NOT 附带 glossary、overview、architecture、flows 或 services 写入；后续独立已授权维护 MUST 不改写历史 Change
