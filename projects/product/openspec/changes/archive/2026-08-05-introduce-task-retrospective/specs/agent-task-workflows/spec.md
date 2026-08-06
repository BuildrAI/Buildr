## ADDED Requirements

### Requirement: 内置任务 Skills 只按 current capability contract 协作
Buildr内置任务Skills MUST依赖capability contracts而不是硬编码optional Skill identity。`task-development` MUST required消费Task Record、Task Environment、Task Review、Task Verification与current knowledge capabilities；`task-triage` MAY optional消费`buildr.task-development/v2`以在首个正式研发动作建立聚合事实；`task-finish` MUST required消费`buildr.task-development@2`与Task Environment。Task Development与Task Finish MUST NOT消费Task Retrospective或已退役task-asset-review authority。

#### Scenario: Task Development使用required providers
- **WHEN** Buildr声明`task-development` builtin
- **THEN** manifest MUST声明`buildr.task-record/v1`、`buildr.task-environment/v1`、`buildr.task-review/v1`、`buildr.task-verification/v3`与`buildr.current-knowledge-maintenance/v2` required dependencies
- **AND** 任一required provider missing/ambiguous/blocked MUST使Development readiness fail closed

#### Scenario: 首个正式研发动作建立聚合事实
- **WHEN** task-triage已经建立active Task与matching ready Environment，并即将进入proposal、design或直接实现
- **THEN** routing MUST调用selected `buildr.task-development/v2` provider的begin action
- **AND** provider缺失或blocked MUST在内容写入前fail closed，不得形成第二个Development writer

#### Scenario: Task Finish消费Development
- **WHEN** Buildr声明`task-finish` builtin
- **THEN** manifest MUST required依赖`buildr.task-development@2`与`buildr.task-environment/v1`
- **AND** MUST不依赖Task Review、Task Verification、current knowledge、Task Retrospective或task-asset-review

#### Scenario: provider替换
- **WHEN** compatible provider替换任一默认Skill
- **THEN** consumer MUST按capability identity与selected binding继续工作
- **AND** MUST NOT按Skill ID、目录或store path硬编码调用

#### Scenario: 没有复盘不影响研发交接
- **WHEN** terminal Task 尚无Task Retrospective Result
- **THEN** Development与Finish applicability MUST保持不变
- **AND** MUST NOT创建空复盘或等待复盘完成

## REMOVED Requirements

### Requirement: 内置任务 Skills 按 capability contract 协作
**Reason**: 旧Requirement同时包含Task Asset Review optional consumer、旧runtime兼容和degraded场景，无法通过局部修改表达完整退役。
**Migration**: 由“内置任务 Skills 只按 current capability contract 协作”替代，保留required provider与provider replacement边界。

### Requirement: 任务资产审查不得扩展 Finish 执行器
**Reason**: 第一版改为 terminal Task 后按需执行的独立效率复盘，Development 不再 finalize observation 或等待人工决定。
**Migration**: 删除 Development 的 optional asset-review dependency 与 handoff 前 finalize；不迁移旧 observation。

### Requirement: Task Review 与 Task Asset Review 必须保持独立 authority
**Reason**: Task Asset Review authority 已退役；Task Review 与新的 Task Retrospective 由各自 Application/Result 保持独立。
**Migration**: 由 `task-retrospectives` capability 定义新边界，删除旧 observation writer 与 consumer。
