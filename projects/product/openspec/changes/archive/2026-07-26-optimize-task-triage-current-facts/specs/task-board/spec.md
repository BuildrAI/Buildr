## MODIFIED Requirements

### Requirement: 任务看板关联真实 OpenSpec change
任务看板 MUST 以稳定 Project task identity 为主，并 MAY 关联零个或多个已创建的 OpenSpec changes；存在关联时 MUST 展示 change id、核实状态、稳定路径及其与交付批次的关系，未来设想或仅有名称的计划 MUST NOT 冒充真实 change。

#### Scenario: 创建任务看板时已有 active change
- **WHEN** Agent 为复杂任务创建任务看板且 active change 已存在
- **THEN** 看板 MUST 在 `changes` 中记录该 change 的真实 id、状态和路径
- **AND** 相应交付批次 MUST 通过 change id 关联该 change

#### Scenario: 创建任务看板时尚无 change
- **WHEN** 任务需要任务看板但尚无已创建的 OpenSpec change
- **THEN** Agent MUST 基于稳定 Project task id 创建看板并保持 `changes` 为空
- **AND** Agent MUST NOT 创建虚假 change 或用未来名称冒充关联

#### Scenario: 复杂 code-only 任务尚无 change
- **WHEN** 任务需要任务看板但当前工作不改变业务语义且没有 OpenSpec change
- **THEN** Agent MUST 使用稳定 Project task id 创建看板并保持 `changes` 为空
- **AND** Agent MUST NOT 为看板创建虚假 change 或用未来名称冒充关联

#### Scenario: change 归档后继续维护看板
- **WHEN** 已关联 change 从 active 移至 archive
- **THEN** Agent MUST 更新该 change 的状态和稳定归档路径
- **AND** 看板 MUST 保留其与历史交付批次的关联

### Requirement: 任务看板按交付批次和依赖池组织进度
任务看板 MUST 用可独立计划、实施和验收的 `batches` 表示可执行交付，并 MUST 用 `dependencyPool` 表示启动条件尚未满足的任务；批次 MAY 包含 OpenSpec、code-only 或外部协作项，`changeIds` MUST 只记录已创建且核实的真实关联，并 MAY 为空。

#### Scenario: 形成可独立交付批次
- **WHEN** 一组任务能够独立计划、实施和验收
- **THEN** Agent MUST 将其组织为具有稳定 id、状态、交付结果和 `changeIds` 的批次
- **AND** 看板 MUST 基于批次和批次内任务计算可核实进度

#### Scenario: Code-only 批次没有 change
- **WHEN** 某个批次不改变业务语义且没有关联 OpenSpec change
- **THEN** 该批次的 `changeIds` MUST 为空数组
- **AND** 看板 MUST 通过任务、代码或验证 evidence 表达其真实进度

#### Scenario: 部分工作仍被依赖阻塞
- **WHEN** 任务中的一部分尚未满足外部条件，但其他工作可以继续
- **THEN** Agent MUST 将未就绪工作保留在 `dependencyPool` 并记录启动条件
- **AND** Agent MUST 将已就绪工作组织为新的可执行批次，而不是阻塞整个任务或强制创建 change
