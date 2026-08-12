## ADDED Requirements

### Requirement: Task Retrospective 必须维护复盘处置 current metadata
Buildr MUST 在同一 `task_retrospective_current` current row 中为每份现有 Retrospective Result 维护 `pending | handled | no-action` 处置状态；处置元数据 MUST 由 Task Retrospective Application 独占读写，并 MUST NOT 进入 Task Record 或第二个 current store。

#### Scenario: 首次或迁移后的复盘待处理
- **WHEN** Agent 首次记录复盘，或 Workspace migration 遇到既有合法 Retrospective Result
- **THEN** current row 的处置状态 MUST 为 `pending`
- **AND** 处置说明与处置时间 MUST 为空

#### Scenario: 标记已处理
- **WHEN** Agent 或 Local App 对 current 复盘提交 `handled`、非空处置说明与匹配的 expected current digest
- **THEN** Application MUST 在单一事务中保存 `handled`、规范化说明与系统处置时间
- **AND** MUST 保持 Retrospective Result、Task Record 与其他专业 current records 不变

#### Scenario: 标记无需处理
- **WHEN** 用户从 Local App 的“无需处理”入口或 Agent 对 current 复盘提交 `no-action`、非空理由与匹配的 expected current digest
- **THEN** Application MUST 保存 `no-action`、规范化理由与系统处置时间
- **AND** MUST 将该状态解释为复盘已形成无需后续行动的处置决定

#### Scenario: 重新打开处置
- **WHEN** Agent 或 Local App 对 `handled` 或 `no-action` current 复盘提交 `pending` 与匹配的 expected current digest
- **THEN** Application MUST 将状态改为 `pending` 并清空处置说明与处置时间
- **AND** MUST NOT 重开 terminal Task 或修改复盘报告

#### Scenario: 无复盘时尝试处置
- **WHEN** Task 没有 current Retrospective Result而调用方提交处置 mutation
- **THEN** Application MUST fail closed 且不得创建空复盘或处置占位 row

### Requirement: 复盘处置 mutation 必须防止陈旧覆盖
Task Retrospective inspect MUST 返回 response-only `currentDigest`，其 identity MUST 同时绑定规范化 Result 与处置元数据；所有处置 mutation MUST 提交 `expectedCurrentDigest`，且 MUST 在同一写事务中校验。

#### Scenario: current digest 匹配
- **WHEN** 处置 mutation 的 `expectedCurrentDigest` 与事务内 current row 匹配
- **THEN** Application MUST 执行合法状态变化并返回新的 `currentDigest`

#### Scenario: current digest 陈旧
- **WHEN** 复盘报告或处置状态已变化，导致 `expectedCurrentDigest` 不再匹配
- **THEN** Application MUST 返回稳定冲突诊断并要求刷新
- **AND** MUST 保持 current row 完整不变，不自动合并或覆盖

### Requirement: 重做复盘必须重置处置状态
Task Retrospective Application `record` MUST 在完整替换同一 Task 的 current Result 时，同事务把处置状态重置为 `pending`，并清空旧处置说明与时间。

#### Scenario: 已处理复盘被重新记录
- **WHEN** 同一 terminal Task 的 current 复盘状态为 `handled` 或 `no-action`，且 Agent 再次成功执行 `record`
- **THEN** 新 current Result 与 `pending` 处置状态 MUST 原子保存
- **AND** 旧处置说明与时间 MUST 不再作为 current 事实返回

## MODIFIED Requirements

### Requirement: Task Retrospective Application 是唯一读写 authority
Task Retrospective Application MUST 通过 Task Record Application 验证 Task identity/status，并通过专用 repository 事务读写 SQLite current row；Skill、Local App 和其他 lifecycle 模块 MUST NOT 直接访问该表。Local App MAY 通过受控 HTTP mutation 调用 Application 维护处置元数据，但 MUST NOT 写入或生成复盘报告。

#### Scenario: Skill 记录复盘
- **WHEN** Agent 完成语义复盘
- **THEN** selected `buildr.task-retrospective/v1` provider MUST 通过随包内部 driver 调用 Application `record`
- **AND** driver MUST 返回结构化 operation evidence

#### Scenario: Agent 处置复盘
- **WHEN** Agent 已检查 current 复盘并形成处置决定
- **THEN** selected provider MUST 通过随包内部 driver 调用 Application `handle`
- **AND** MUST 提交处置状态、适用的非空说明与 inspect 返回的 expected current digest

#### Scenario: Local App 读取复盘
- **WHEN** 用户打开 Task 详情的“复盘”Tab
- **THEN** Local App MUST 通过 Application `inspect` 取得 current Result 与处置元数据
- **AND** MUST NOT直接访问 SQLite 或生成复盘 Markdown

#### Scenario: Local App 处置复盘
- **WHEN** 用户在“复盘”Tab 标记已处理、无需处理或重新打开
- **THEN** HTTP interface MUST 验证同源、session、JSON、body size、字段白名单和 expected current digest，再调用 Application `handle`
- **AND** MUST NOT修改 Task 顶层状态或其他专业 current records

### Requirement: Local App 展示只读复盘 Tab
Local App Task 详情 MUST 提供“复盘”Tab，只读展示 current Result 的完成时间与 Markdown 报告，并展示和受控维护 current 处置元数据；该 Tab MUST 对有无复盘记录都可访问，且 MUST 至少提供明确的“无需处理”入口。

#### Scenario: Task 已有复盘
- **WHEN** `inspect` 返回 current Result
- **THEN** Tab MUST 安全渲染 `reportMarkdown` 与 `completedAt`
- **AND** MUST 展示 current 处置状态，但不得改写 Markdown Result

#### Scenario: Task 已有待处理复盘
- **WHEN** `inspect` 返回 current Result 且处置状态为 `pending`
- **THEN** Tab MUST 安全渲染 `reportMarkdown`、`completedAt` 与“待处理”状态
- **AND** MUST 提供“已处理”和“无需处理”入口，并在提交前要求非空说明或理由

#### Scenario: Task 复盘已有处置结论
- **WHEN** `inspect` 返回 `handled` 或 `no-action`
- **THEN** Tab MUST 展示处置状态、说明与处置时间
- **AND** MUST 提供“重新打开”入口，但 MUST NOT把处置状态解释为后续改进已经完成

#### Scenario: Task 尚无复盘
- **WHEN** `inspect` 返回 absent
- **THEN** Tab MUST 显示“尚未复盘”且 MUST 不展示处置 mutation
- **AND** MUST NOT把缺失解释为 blocked、failed 或 Task 未完成
