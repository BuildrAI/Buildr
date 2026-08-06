# task-retrospectives Specification

## Purpose

定义终态 Task 的单一当前执行效率复盘、SQLite 所有权、Skill 写入边界和 Local App 只读投影。

## Requirements

### Requirement: Task Retrospective 保存单一当前执行效率复盘
Buildr MUST 为每个 terminal Task 在 Workspace SQLite 中保存至多一份 current Task Retrospective Result；Result MUST 使用 closed `buildr.task-retrospective-result/v1`，只包含 `taskId`、固定 `focus: agent-execution-efficiency`、非空 `reportMarkdown` 与 `completedAt`。

#### Scenario: 首次记录终态 Task 复盘
- **WHEN** Agent 为 `completed` 或 `abandoned` Task 提交合法 Result
- **THEN** Task Retrospective Application MUST 在 SQLite 中原子写入该 Task 的 current row
- **AND** operation result MUST 返回已保存的规范化 Result

#### Scenario: 重复复盘完整替换
- **WHEN** 同一 terminal Task 已有 current Result 且 Agent 再次提交合法 Result
- **THEN** Application MUST 在单一事务中完整替换旧 row
- **AND** MUST NOT 创建 revision、history、candidate 或第二个 current slot

#### Scenario: active Task 拒绝记录
- **WHEN** Agent 尝试为 active Task 写入复盘
- **THEN** Application MUST fail closed 且不改变既有 current row
- **AND** Task status MUST保持不变

### Requirement: Task Retrospective 只基于当前可见证据
`task-retrospective` Skill MUST 让 Agent 基于当前 session/runtime 可访问的任务步骤与结果，识别执行时间、token 消耗、重复尝试、等待和人机协作中的高成本点，并推理可落地的优化方向；Skill MUST NOT 要求或声称读取隐藏推理、完整对话、完整工具日志或后台任务事件。

#### Scenario: 可见精确成本数据
- **WHEN** 当前上下文明确提供某步骤的耗时或 token 数
- **THEN** Agent MUST 可在报告中引用该数据并关联具体优化判断

#### Scenario: 精确成本数据不可见
- **WHEN** 当前上下文不能提供完整耗时或 token 数
- **THEN** Agent MUST 明确数据缺口并只使用可观察事实与标明的推断
- **AND** MUST NOT 伪造精确数值

#### Scenario: 保持自由推理空间
- **WHEN** Agent 生成第一版复盘
- **THEN** capability MUST 只要求一份自由 Markdown 报告
- **AND** MUST NOT 强制评分、固定问题分类、候选列表或结构化优化项

### Requirement: Task Retrospective Application 是唯一读写 authority
Task Retrospective Application MUST 通过 Task Record Application 验证 Task identity/status，并通过专用 repository 事务读写 SQLite current row；Skill、Local App 和其他 lifecycle 模块 MUST NOT 直接访问该表。

#### Scenario: Skill 记录复盘
- **WHEN** Agent 完成语义复盘
- **THEN** selected `buildr.task-retrospective/v1` provider MUST 通过随包内部 driver 调用 Application `record`
- **AND** driver MUST 返回结构化 operation evidence

#### Scenario: Local App 读取复盘
- **WHEN** 用户打开 Task 详情的“复盘”Tab
- **THEN** Local App MUST 通过 Application `inspect` 取得 current Result
- **AND** MUST NOT提供写入、触发或审批动作

### Requirement: Local App 展示只读复盘 Tab
Local App Task 详情 MUST 提供“复盘”Tab，展示 current Result 的完成时间与 Markdown 报告；该 Tab MUST 对有无复盘记录都可访问。

#### Scenario: Task 已有复盘
- **WHEN** `inspect` 返回 current Result
- **THEN** Tab MUST 安全渲染 `reportMarkdown` 与 `completedAt`

#### Scenario: Task 尚无复盘
- **WHEN** `inspect` 返回 absent
- **THEN** Tab MUST 显示“尚未复盘”
- **AND** MUST NOT把缺失解释为 blocked、failed 或 Task 未完成

### Requirement: Task Retrospective 不成为生命周期门禁
Task Record terminal transition、Task Development、Task Finish、Environment cleanup 与 OpenSpec lifecycle MUST NOT required 消费 Task Retrospective capability 或检查 Result 是否存在。

#### Scenario: 没有复盘仍可完成任务
- **WHEN** Task 满足自身 terminal transition、handoff、delivery 或 cleanup 条件但没有 Retrospective Result
- **THEN** 对应 lifecycle operation MUST 正常继续
- **AND** MUST NOT 创建空复盘或隐式触发 Agent 复盘

### Requirement: 旧 observation 保持不可见且不迁移
Task Retrospective implementation MUST NOT 读取、迁移、删除或双写既有 `.buildr/asset-review/` 内容；该目录可继续由 `.gitignore` 排除，但不得成为 current capability 的数据源。

#### Scenario: Workspace 存在旧 observation
- **WHEN** Workspace 升级后仍包含 `.buildr/asset-review/` 文件
- **THEN** Task Retrospective inspect/record 与 Local App MUST 忽略这些文件
- **AND** package update/sync MUST 保留其字节内容
