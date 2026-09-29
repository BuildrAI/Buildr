# task-evidence-coverage Delta: agent-task-workflows

## ADDED Requirements

### Requirement: 任务目标必须写成简洁清晰的任务需求

Buildr 任务指引 MUST 把 Task `intent`（目标与说明）定位为每个正式任务（Task）必写的任务级需求说明：创建或修订时以简洁清晰的自然语言说明本次要解决的问题、目标与范围边界，需要验收要点时一并写出；MUST NOT 退化为标题复述、内部步骤清单或只有作者能懂的缩写。关联变更（Change）的 `brief.md` 继续作为该变更的补充需求说明，不替代任务级目标。

#### Scenario: 创建任务时书写需求

- **WHEN** Agent 调用 `task create` 或修订 Task 目标
- **THEN** `intent` MUST 说明本次任务内容、目标与范围边界
- **AND** MUST NOT 只写入与标题重复的短语或不对外可读的内部记号

#### Scenario: 变更 Brief 与任务目标的分工

- **WHEN** Task 关联一个或多个 OpenSpec Change
- **THEN** Task `intent` MUST 保持任务级需求说明
- **AND** Change `brief.md` MUST 只补充该变更的需求或说明，两者 MUST NOT 相互复制正文或相互矛盾

### Requirement: 变更路径任务默认携带方案与实现审查

Buildr 任务指引 MUST 把 Task Review 的默认触发绑定到已作出的语义治理路径，而不是依赖 Agent 逐任务自发判断：选择 `change-flow` 的 Task 在规划材料齐备后 MUST 默认执行一次 Planning Review，在实现完成、验证对象稳定后 MUST 默认执行一次 Completion Review；`code-only`、`spec-maintenance` 或无正式 Task 的工作保持按需触发。Planning Review MUST 核对任务需求与方案材料（提案、设计、规范增量、实施清单）的一致性以及方案的完整性与合理性；Completion Review MUST 以任务需求与已审方案为基线核对真实实现。审查结果继续保持可选证据性质，MUST NOT 成为完成、归档或交付门禁。

#### Scenario: change-flow 任务默认两次审查

- **WHEN** Task 选择 `change-flow` 且规划材料齐备
- **THEN** 指引 MUST 引导 Agent 默认执行 Planning Review 并按现有语义记录 Result
- **AND** 实现完成形成稳定审查对象后 MUST 默认执行 Completion Review 并记录 Result

#### Scenario: 非变更路径不默认审查

- **WHEN** Task 为 `code-only`、`spec-maintenance` 或其他无正式方案材料的路径
- **THEN** 指引 MUST NOT 把 Task Review 列为默认动作
- **AND** 用户明确要求或 Agent 按真实风险判断需要时仍 MUST 可执行并记录

#### Scenario: 默认审查缺失不形成门禁

- **WHEN** 默认审查未执行、结论为 `changes-requested` 或审查对象已变化
- **THEN** Task 完成、Change 收敛归档与交付 MUST 不被该事实自动阻塞
- **AND** Agent MUST 如实说明审查覆盖情况与未覆盖原因，不得把缺失表述为已通过

### Requirement: 收尾登记完成前必须补登已发生的审查与验证证据

收尾指引 MUST 在登记任务完成前加入就近核对：Task 仍为 `active` 时，若本次实际执行过验证或审查但对应 Task Verification Report 或 Task Review Result 尚未登记，Agent MUST 先完成登记再执行完成动作；不得补造未发生的检查或审查，也不得把缺失登记升级为完成门禁。该要求只保证已发生事实不越过终端写入窗口，不要求新增检查。

#### Scenario: 已发生证据尚未登记

- **WHEN** Agent 即将调用 `task complete`，且本次实际执行的检查或审查尚未保存为对应 Report/Result
- **THEN** 指引 MUST 要求先登记该证据，再登记任务完成
- **AND** MUST NOT 因登记动作补跑无关检查或虚构未发生的验证

#### Scenario: 无待登记证据

- **WHEN** 本次没有实际执行过需要登记的检查或审查
- **THEN** 完成登记 MUST 直接继续，MUST NOT 因没有报告而推断验证缺失或阻塞完成

### Requirement: 规划材料齐备声明前必须核对变更 Brief 存在

OpenSpec `propose` 增强指引 MUST 要求 Agent 在声明规划材料齐备或移交审查/实现前，确认 Change root 内 `brief.md` 实际存在且为本次生成的有效文件；缺失时 MUST 先补齐或如实说明不适用原因，不得把缺失文件表述为已就绪。该核对是文件存在性自查，不新增审批门禁或第二份规范来源。

#### Scenario: 规划完成前的 Brief 自查

- **WHEN** Agent 完成 proposal、design、specs、tasks 并准备报告规划结果
- **THEN** Agent MUST 核对 `brief.md` 存在于当前 Change root
- **AND** 缺失时 MUST 先创建或向用户说明缺口，MUST NOT 直接把缺失状态报告为完整

#### Scenario: 既有变更缺少 Brief

- **WHEN** 接续的既有 Change 缺少 `brief.md`
- **THEN** Agent MUST 如实说明 Brief 缺失并继续提供现有材料
- **AND** MUST NOT 伪造一份虚构 Brief 冒充历史产物
