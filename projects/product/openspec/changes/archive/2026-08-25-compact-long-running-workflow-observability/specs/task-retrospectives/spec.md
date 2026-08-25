## MODIFIED Requirements

### Requirement: Task Retrospective 必须提供有界批量只读检查
Task Retrospective Application MUST 复用 Task Record current query 与单 Task Retrospective inspect 语义，为内部 Agent provider 提供同时受数量与固定 UTF-8 字节预算约束的批量只读检查；该操作 MUST 不新增存储、不修改 Task 或 Retrospective current、不生成分析、评分或处置决定。

#### Scenario: 默认读取待处理复盘摘要
- **WHEN** Agent 调用批量检查且未指定处置状态、正文、数量或字节上限
- **THEN** Application MUST 查询 `pending` current 复盘并按 Task ID 稳定排序
- **AND** MUST在默认数量与字节预算内返回完整摘要项、完整匹配数、返回数、UTF-8返回字节数与 `truncated` 状态
- **AND** 每项摘要 MUST 包含 Task identity/title/status、完成时间、result/current digest、disposition 与 current follow-up Task 摘要
- **AND** operation result MUST 返回 `effects: []`

#### Scenario: 按状态和显式 Task 集合过滤
- **WHEN** Agent 指定 `pending|handled|no-action|all` 状态、一个或多个 Task ID、合法 limit与合法字节预算
- **THEN** Application MUST 对 current Task query、状态与显式 Task 集合取交集
- **AND** MUST 不从旧文件、历史记录或 `.buildr/asset-review/` 补齐结果

#### Scenario: 显式包含复盘正文
- **WHEN** Agent 明确请求批量结果包含报告正文
- **THEN** Application MUST只追加能作为完整 item 落入当前字节预算的 current `reportMarkdown`
- **AND** 不能完整容纳的正文 MUST省略并使批量结果标记 truncated，调用方可用单 Task inspect读取
- **AND** 未明确请求时 MUST 省略正文而不是返回空字符串或截断内容

#### Scenario: 单项复盘读取失败
- **WHEN** 匹配集合中的一个 Task 无法形成合法 current inspect 结果
- **THEN** 批量操作 MUST 为该 Task 返回 item-level diagnostic并在剩余字节预算内继续读取其他匹配 Task
- **AND** MUST NOT修复、删除、处置或隐藏损坏的 current row

#### Scenario: 批量输入越界
- **WHEN** status、Task ID、limit或字节预算非法，limit超过500或字节预算超过固定公共最大值
- **THEN** Application MUST 在读取结果前 fail closed 并返回稳定诊断
- **AND** Task Record、Retrospective current 与其他专业事实 MUST 保持不变
