# task-planning-identity Specification

## Purpose

定义正式 Task 的 OpenSpec 计划语义投影、确定性 aggregate identity、非语义执行事实排除项和无法可靠解析时的保守失败结果。

## Requirements

### Requirement: Task planning identity 必须来自 closed 语义投影
Buildr MUST 为正式 Task 提供只读 Task Planning Identity Application。Application MUST 从 Task Record 的 Intent/scope 与全部关联 Task-scoped OpenSpec Change 的 proposal、design、delta specs 和任务文本构造 closed semantic projection，并按稳定 logical key 排序后生成唯一 sha256 target identity；MUST NOT要求调用方提交文件摘要、路径或手工 aggregate identity。

#### Scenario: 多个关联 Change 形成确定性 target
- **WHEN** 正式 Task 的全部关联 Change 均可从 matching Task Environment 或 retained archive 可靠解析，且必需 planning artifacts 完整
- **THEN** Application MUST 返回 `resolved`、非空 target identity、语义摘要和按稳定 key 排序的 planning nodes
- **AND** 相同语义内容在不同读取顺序下 MUST 生成相同 identity

### Requirement: 非语义执行事实不得改变 target identity
Semantic projection MUST 排除 checkbox 完成态、active/archive 目录与 provenance、绝对或相对文件路径、filesystem 时间、Change progress、Brief、knowledge-impact sidecar、Git/Environment identity和Review/Verification执行事实。Markdown normalization MUST 至少统一换行、尾随空白、连续空行与 tasks checkbox marker，但 MUST 保留任务文本、Requirement/Scenario、目标、范围、风险与决策变化。

#### Scenario: checklist 与 archive provenance 改变
- **WHEN** OpenSpec planning artifacts 的语义文本未变，只有 `tasks.md` checkbox 从未完成变为完成且 Change 从active路径移动到日期化archive路径
- **THEN** resolver MUST 返回与变化前完全相同的 target identity和artifact semantic identities

#### Scenario: spec 或关键决策改变
- **WHEN** delta Requirement、Scenario、Task Intent/scope、关键任务文本、design decision或risk发生变化
- **THEN** resolver MUST 返回不同的 target identity

### Requirement: 无法可靠解析时必须保守阻塞
Application MUST 要求至少一个关联 Change，并要求每个 Change 的 proposal、design、tasks 与至少一个 delta spec 存在且满足当前受支持的结构。Task、Environment、Change resolution、artifact读取、section、Requirement/Scenario或task item任一不可证明时 MUST 返回 `blocked`、空 target identity、精确 diagnostic与唯一next action；MUST NOT回退到raw file digest、时间、Git ref或旧Review target。

#### Scenario: 缺少或未知 artifact 结构
- **WHEN** 任一关联 Change 缺少必需 artifact，或 Markdown 结构无法按当前 closed parser可靠识别
- **THEN** Application MUST fail closed且不得返回可供 Planning Review record/inspect复用的target identity

### Requirement: Result 必须保持 response-only
Task Planning Identity Result MUST 只表达 operation、status、Task ID、可空 target、可空 semantic projection摘要、planning nodes、ignored fact categories、diagnostic、effects与nextActions。Application MUST 不写 Task Record、Development Receipt、Review Result、Workspace SQLite、Change artifact或任何cache/history。

#### Scenario: 成功解析 target
- **WHEN** Application 成功返回 resolved target
- **THEN** effects MUST 为空且重复调用不得产生filesystem或SQLite写入
