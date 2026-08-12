## Context

Task Retrospective 当前由独立 Application 在 Workspace SQLite 的 `task_retrospective_current` 中按 Task ID 保存一份 closed `buildr.task-retrospective-result/v1`，Local App 只读展示，Task 列表只判断 current row 是否存在。该模型能回答“是否复盘”，但不能回答复盘是否已经形成处置决定。

处置状态会同时被 Agent、Local App 详情 mutation 和 Task 列表查询消费，涉及 Product OpenSpec、Buildr Service、Buildr Web Service 与 SQLite migration。它必须继续保持专业 authority 独立、单 current row、非门禁和无 history 的既有边界。

## Goals / Non-Goals

**Goals:**

- 用 `pending | handled | no-action` 表达复盘当前处置结论。
- 页面明确提供“无需处理”入口，并允许“已处理”和“重新打开”。
- Agent 与页面复用同一 Task Retrospective Application mutation。
- 重做复盘后可靠回到待处理，并用乐观并发保护避免处置旧报告。
- 在 Task 列表中直接筛选未复盘、待处理、已处理或无需处理。

**Non-Goals:**

- 不把处置状态解释为后续改进 Task 的执行进度。
- 不重开 terminal Task，不增加 Retrospective history、审批、评分、通知或自动生成改进 Task。
- 不改变 `buildr.task-retrospective-result/v1` 的自由 Markdown 报告 schema。
- 不让处置状态进入 Task Record、Development、Finish 或 cleanup gate。

## Decisions

### 1. 处置元数据与报告保存在同一 current row

`task_retrospective_current` 增加 `disposition_status`、`disposition_note` 与 `disposed_at`，其中现有和新建报告默认 `pending`。`handled` 与 `no-action` 要求非空说明和系统时间；`pending` 清空说明与时间。

报告 Result 继续使用 v1 closed schema，处置元数据作为 Application current slot 的 sibling read model 返回。这样保持报告内容契约稳定，也不创建第二个 store、writer 或 current slot。

替代方案是在 Task Record 增加字段或建立独立处置表；前者复制专业事实，后者为一个三态 current metadata 增加不必要的 authority 和关联复杂度，因此不采用。

### 2. 使用 response-only `currentDigest` 保护处置 mutation

Application 对报告 Result 与处置元数据的规范化组合计算 `currentDigest`。Agent driver 和 Local App PATCH 必须提交 `expectedCurrentDigest`；不匹配时返回冲突并要求刷新，不自动合并。

既有 `resultDigest` 继续只证明报告 Result，避免改变既有消费者语义。相比只校验 `resultDigest`，`currentDigest` 还能阻止两个页面或 Agent 对处置状态的并发覆盖。

### 3. `record` 总是把处置状态重置为 `pending`

每次完整替换复盘报告都代表出现了新的 current 分析，即使 Markdown 恰好相同，也必须重新形成处置决定。因此 `record` 在同一事务中替换 Result 并清空旧处置说明/时间。

不比较 Markdown 或忽略 `completedAt`，避免引入语义等价判断和隐藏的“是否真的变化”规则。

### 4. 一个受控 `handle` 动作覆盖处置和重新打开

Task Retrospective Application 增加 `handle`：

- `handled`：表示已形成处置决定或已安排后续行动；必须提供说明。
- `no-action`：表示经判断无需后续行动；必须提供理由。
- `pending`：重新打开当前复盘，清空处置说明与时间。

内部 driver 暴露相同 action；Local App 通过同源/session/JSON/字段白名单保护的 PATCH 调用。页面不编辑 Markdown，也不直接写数据库。

### 5. Task 列表增加统一 `retrospectiveState`，保留旧过滤参数

新增闭合查询 `retrospectiveState=missing|pending|handled|no-action|all`，Task Record query repository 只从 Retrospective owner row 派生过滤，不把状态复制进 Task Record。现有 `hasRetrospective=yes|no|all` 保留兼容；Web 页面改用单一“复盘状态”下拉，避免两个控件组合出矛盾条件。

选择任一非 `all` 复盘状态时，页面把默认 `status=active` 显式切换为 `all`，因为 Retrospective 只属于 terminal Task；用户随后仍可选择 completed 或 abandoned 进一步收窄。

### 6. 术语固定为“复盘处置状态”

“已处理”只表示复盘已经被处置，不表示复盘建议已经全部实现。需要修改代码、文档、Rule、Skill 或流程时，仍创建新的正式 Task 并按其生命周期推进；首版只在处置说明中记录相关 Task ID，不新增通用 Task relation。

## Risks / Trade-offs

- [现有 12 份复盘升级后全部进入待处理队列] → 没有历史证据证明它们已经处置，宁可保守标记 `pending`；用户可以批次判断但首版不提供批量 mutation。
- [Local App 从只读专业视图增加写入口] → mutation 仅覆盖处置元数据，继续经过同一 Application、session 与 expected digest，不允许编辑报告或其他专业事实。
- [旧 runtime 无法理解新 migration] → 沿用 schema ledger 的 fail-closed 行为；安装包、Buildr Service 与 Web dist 同版本交付，不提供双写或降级读取。
- [“已处理”被误解为改进完成] → 在规范、Skill、页面文案和 glossary 中统一说明其含义，并要求非空处置说明。
- [列表默认 active 与复盘状态不相容] → Web 选择复盘状态时显式切到 `status=all`，清除筛选恢复默认 active。

## Migration Plan

1. 追加连续 SQLite migration，为既有 row 增加处置列与约束；所有既有 row 初始化为 `pending`。
2. 升级 repository/domain/Application 与 internal driver，保持 Result v1，新增 current slot metadata、`currentDigest` 和 `handle`。
3. 升级 Task collection query、Local App HTTP PATCH 与 React 页面。
4. 更新 package contract/Skill/current knowledge，并通过 migration、Application、HTTP、Web 与 Browser 相关验证。

不提供 down migration。交付失败时保留新 runtime 与数据库现场并按现有 migration/Doctor 诊断恢复，不用旧 runtime 回读新 schema。

## Open Questions

无。用户已确认页面必须提供“无需处理”入口，并接受上述三态及“已处理”的处置语义。
