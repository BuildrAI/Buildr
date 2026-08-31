## ADDED Requirements

### Requirement: 父任务贡献登记必须支持直接完成的子任务
既有 reconcile-child-delivery MUST支持明确完成的直接子任务，绑定结果版本、当前父计划及显式贡献映射；MUST不要求旧收尾关联或候选，MUST不自动将 completed 当作全部贡献或最终验收。

#### Scenario: 直接完成子任务
- **WHEN** 已完成子任务没有旧交接且明确提交成果映射
- **THEN** 校验关系和版本后通过既有登记能力保存贡献判断

#### Scenario: 并发变化
- **WHEN** 登记时父计划或任务结果与观察版本不符
- **THEN** 拒绝覆盖

#### Scenario: 仅完成状态
- **WHEN** 子任务已完成但无贡献处置
- **THEN** 不推断贡献已验收

## MODIFIED Requirements

### Requirement: Child 必须独立交付并形成 Contribution Handoff
已有贡献登记 MUST支持直接完成的子任务；必须明确贡献映射、reason、source、expectedTaskDigest 与当前父计划，校验直接关系、规范归档、结果身份和其他子任务归属。MUST不要求旧候选、收尾关联或Child研发记录；不能仅从completed推断贡献或父任务验收。旧v1证据只读，新v2写同一已有表并保持事务、幂等与冲突保护。

#### Scenario: Child 只交付部分计划范围
- **WHEN** 子任务已完成，调用方已核对真实成果并提交完整且当前的贡献处置
- **THEN** MUST通过既有入口记录并显示贡献判断；相同重放保持不变，父任务仍独立验收

### Requirement: 正式 Child 必须代表独立交付的 Contribution
已有贡献登记 MUST支持直接完成的子任务；必须明确贡献映射、reason、source、expectedTaskDigest 与当前父计划，校验直接关系、规范归档、结果身份和其他子任务归属。MUST不要求旧候选、收尾关联或Child研发记录；不能仅从completed推断贡献或父任务验收。旧v1证据只读，新v2写同一已有表并保持事务、幂等与冲突保护。

#### Scenario: 同一 Contribution 内并行协作
- **WHEN** 子任务已完成，调用方已核对真实成果并提交完整且当前的贡献处置
- **THEN** MUST通过既有入口记录并显示贡献判断；相同重放保持不变，父任务仍独立验收

#### Scenario: 工作单元可以独立交付
- **WHEN** 子任务已完成，调用方已核对真实成果并提交完整且当前的贡献处置
- **THEN** MUST通过既有入口记录并显示贡献判断；相同重放保持不变，父任务仍独立验收

### Requirement: 终态 Child Contribution 交付恢复必须由严格证据保护
已有贡献登记 MUST支持直接完成的子任务；必须明确贡献映射、reason、source、expectedTaskDigest 与当前父计划，校验直接关系、规范归档、结果身份和其他子任务归属。MUST不要求旧候选、收尾关联或Child研发记录；不能仅从completed推断贡献或父任务验收。旧v1证据只读，新v2写同一已有表并保持事务、幂等与冲突保护。

#### Scenario: 恢复真实已交付 Child
- **WHEN** 子任务已完成，调用方已核对真实成果并提交完整且当前的贡献处置
- **THEN** MUST通过既有入口记录并显示贡献判断；相同重放保持不变，父任务仍独立验收

#### Scenario: 缺少正式交付关联
- **WHEN** 子任务已完成，调用方已核对真实成果并提交完整且当前的贡献处置
- **THEN** MUST通过既有入口记录并显示贡献判断；相同重放保持不变，父任务仍独立验收

#### Scenario: 正常 Child 尝试提前使用恢复
- **WHEN** 子任务尚未完成或未提交明确贡献处置
- **THEN** MUST不从状态猜测贡献，不登记虚假完成

### Requirement: Parent progress 必须消费合法恢复证据且保留来源
已有贡献登记 MUST支持直接完成的子任务；必须明确贡献映射、reason、source、expectedTaskDigest 与当前父计划，校验直接关系、规范归档、结果身份和其他子任务归属。MUST不要求旧候选、收尾关联或Child研发记录；不能仅从completed推断贡献或父任务验收。旧v1证据只读，新v2写同一已有表并保持事务、幂等与冲突保护。

#### Scenario: 恢复证据使 unproven 变为 delivered
- **WHEN** 子任务已完成，调用方已核对真实成果并提交完整且当前的贡献处置
- **THEN** MUST通过既有入口记录并显示贡献判断；相同重放保持不变，父任务仍独立验收

#### Scenario: 恢复证据与current Plan不兼容
- **WHEN** 身份、内容、父计划、任务结果版本或归属存在冲突
- **THEN** MUST拒绝相关写入或不采用陈旧证据，保留已有结果并报告精确原因

### Requirement: 终态恢复必须幂等且拒绝交付 owner 冲突
已有贡献登记 MUST支持直接完成的子任务；必须明确贡献映射、reason、source、expectedTaskDigest 与当前父计划，校验直接关系、规范归档、结果身份和其他子任务归属。MUST不要求旧候选、收尾关联或Child研发记录；不能仅从completed推断贡献或父任务验收。旧v1证据只读，新v2写同一已有表并保持事务、幂等与冲突保护。

#### Scenario: 相同恢复重放
- **WHEN** 子任务已完成，调用方已核对真实成果并提交完整且当前的贡献处置
- **THEN** MUST通过既有入口记录并显示贡献判断；相同重放保持不变，父任务仍独立验收

#### Scenario: Contribution owner 冲突
- **WHEN** 身份、内容、父计划、任务结果版本或归属存在冲突
- **THEN** MUST拒绝相关写入或不采用陈旧证据，保留已有结果并报告精确原因
