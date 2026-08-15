## ADDED Requirements

### Requirement: Task Retrospective 必须提供有界批量只读检查
Task Retrospective Application MUST 复用 Task Record current query 与单 Task Retrospective inspect 语义，为内部 Agent provider 提供有界批量只读检查；该操作 MUST 不新增存储、不修改 Task 或 Retrospective current、不生成分析、评分或处置决定。

#### Scenario: 默认读取待处理复盘摘要
- **WHEN** Agent 调用批量检查且未指定处置状态、正文或返回上限
- **THEN** Application MUST 查询 `pending` current 复盘并按 Task ID 稳定排序
- **AND** MUST 最多返回前 100 项摘要、完整匹配数、返回数与 `truncated` 状态
- **AND** 每项摘要 MUST 包含 Task identity/title/status、完成时间、result/current digest、disposition 与 current follow-up Task 摘要
- **AND** operation result MUST 返回 `effects: []`

#### Scenario: 按状态和显式 Task 集合过滤
- **WHEN** Agent 指定 `pending|handled|no-action|all` 状态、一个或多个 Task ID 与不超过 500 的合法 limit
- **THEN** Application MUST 对 current Task query、状态与显式 Task 集合取交集
- **AND** MUST 不从旧文件、历史记录或 `.buildr/asset-review/` 补齐结果

#### Scenario: 显式包含复盘正文
- **WHEN** Agent 明确请求批量结果包含报告正文
- **THEN** 每个成功项 MUST additive 返回 current `reportMarkdown`
- **AND** 未明确请求时 MUST 省略正文而不是返回空字符串或截断内容

#### Scenario: 单项复盘读取失败
- **WHEN** 匹配集合中的一个 Task 无法形成合法 current inspect 结果
- **THEN** 批量操作 MUST 为该 Task 返回 item-level diagnostic 并继续读取其他匹配 Task
- **AND** MUST NOT修复、删除、处置或隐藏损坏的 current row

#### Scenario: 批量输入越界
- **WHEN** status、Task ID 或 limit 非法，或 limit 超过 500
- **THEN** Application MUST 在读取结果前 fail closed 并返回稳定诊断
- **AND** Task Record、Retrospective current 与其他专业事实 MUST 保持不变

### Requirement: 内部 Task Retrospective driver 必须开放批量 list action
随包内部 Task Retrospective driver MUST 提供 `list` action，并 MUST 将 status、重复 Task ID、limit 与是否包含正文作为显式参数交给同一次 Application operation；现有单 Task `inspect|record|handle` 行为 MUST 保持兼容。

#### Scenario: Agent 使用批量 list
- **WHEN** Agent 需要枚举一组 current 复盘
- **THEN** driver MUST 通过单次进程调用返回闭合 `buildr.task-retrospective-list-result/v1`
- **AND** MUST 不循环调用自身、不写临时导出文件或调用任何 mutation action

#### Scenario: Agent 只需查看个别完整报告
- **WHEN** 批量摘要已定位少量需要进一步判断的 Task
- **THEN** provider MUST 允许 Agent继续使用既有单 Task `inspect` 读取完整 current Result
- **AND** MUST NOT要求批量 list 成为记录、处置或 Task lifecycle 的前置门禁
