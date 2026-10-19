## MODIFIED Requirements

### Requirement: 任务检查必须分别判断适用性

Buildr 任务指引 MUST 分别按实际目标、方案选择、范围、风险与完成证明需要判断方案审查（Planning Review）、实现审查（Implementation Review，兼容接口类型 `completion`）和任务验证（Task Verification），MUST NOT 将三项默认触发机械绑定到 `change-flow` 或是否采用 OpenSpec。当任务产生提案或设计材料时 MUST 需要方案审查；开发实现完成时 MUST 需要实现审查；任务实际执行过完成依据所需的检查时 MUST 登记任务验证报告。不适用判断 MUST 通过工作摘要检查结论在任务详情显式留痕，MUST NOT 只留在对话或自由文本中。方案审查 MUST 核对任务需求与真实方案的完整性、合理性及一致性；实现审查 MUST 核对实际成果是否兑现当前任务需求与适用方案；任务验证 MUST 检查完成依据所需的真实结果。方案可来自任务文档、设计、清单或专业产物，OpenSpec artifacts 只是其中一种来源。专业结果继续由各自应用（Application）维护，不新增统一就绪、审批或适用性状态库；结果存在或缺失 MUST NOT 自动成为完成、归档或交付门禁。以下旧场景标题仅为规范条目的兼容身份，MUST 以更新后的 WHEN/THEN 判断行为，MUST NOT 根据标题恢复按路径默认两次审查或排除非变更任务的规则。

#### Scenario: change-flow 任务默认两次审查
- **WHEN** `change-flow` 任务的真实方案风险和实现风险分别需要审查
- **THEN** 指引 MUST 在适用对象可读时执行 Planning Review，并在实现对象稳定时执行 Completion Review，按现有语义保存真实结果
- **AND** MUST 根据完成证明需要独立选择 Task Verification，不以两次审查替代验证

#### Scenario: 非变更路径不默认审查
- **WHEN** Task 为 `code-only`、`spec-maintenance` 或其他不采用 OpenSpec 的路径
- **THEN** 指引 MUST NOT 仅凭路径自动添加或排除审查、验证，而 MUST 按目标、真实方案和风险分别判断
- **AND** 用户明确要求或真实风险需要时 MUST 可执行并记录，MUST NOT 要求先创建 Change

#### Scenario: 默认审查缺失不形成门禁
- **WHEN** 所需审查未执行、结论为 `changes-requested` 或审查对象已变化
- **THEN** Task 完成、Change 收敛归档与交付 MUST 不被该记录事实自动阻塞
- **AND** Agent MUST 如实说明覆盖、未完成事项和原因；必要目标或风险尚未解决时 MUST NOT 声称整体完成，也不得把未完成表述为不适用或已通过

#### Scenario: 必要检查尚未完成
- **WHEN** 方案审查、实现审查或验证已判断需要，但材料缺失、工具不可用或执行尚未结束
- **THEN** 智能体（Agent）MUST 在既有方案或工作摘要中说明需要、当前缺口和下一步，专业应用只保存已形成的真实结果
- **AND** MUST NOT 标记“不适用”、生成通过占位或为等待检查新增审批状态

#### Scenario: 本次检查确实不适用
- **WHEN** 当前目标、方案与风险没有某项审查或验证的实际需要
- **THEN** 智能体（Agent）MUST 给出与本次事实相符的简短理由，并通过工作摘要检查结论在任务详情显式留痕
- **AND** MUST NOT 仅因没有 Change、没有结果或尚未执行就推断不适用，也不得只把理由写在对话或临时说明中
