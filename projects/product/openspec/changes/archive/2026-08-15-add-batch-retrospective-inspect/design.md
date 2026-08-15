## Context

Task Record Application 已支持按 `retrospectiveState` 查询 current Task view，Task Retrospective Application 已支持单 Task `inspect`。当前效率问题来自 Agent 必须为每个 Task 单独启动内部 driver，而不是缺少数据或读取 authority。

批量入口属于内部 Agent provider surface，但会产生新的闭合 JSON 行为，因此需要同步规范、Application、driver、随包 Skill、contract 和测试。现有 SQLite current row、单 Task operation result 与 Buildr Web 行为保持不变。

## Goals / Non-Goals

**Goals:**

- 用一次内部 driver 调用读取一组 current Retrospective Result。
- 默认返回紧凑摘要，仅在显式请求时包含 Markdown 正文。
- 对返回条数设置默认值和硬上限，避免无界输出。
- 保持确定性顺序、逐项诊断和零写入证据。

**Non-Goals:**

- 不优化为单条 SQL 或新增批量 repository API。
- 不增加 cursor、持久导出文件、缓存或第二存储。
- 不自动分析报告、评分、生成行动项、创建 Task 或修改 disposition。
- 不修改 Buildr Web 或公开顶层 CLI。

## Decisions

### 复用现有 Application，而不是直接批量读取 SQLite

新增 Task Retrospective Application `list` operation：先调用 Task Record current query 取得匹配 Task，再逐项复用单 Task inspect 语义。这样保留 Task identity、current digest 和 follow-up 的唯一读取边界。虽然内部仍有逐项读取，但消除了 Agent 的重复进程启动和中间输出；本次不为数据库微优化增加新 repository 契约。

### 使用一个有界 `list` action

内部 driver 增加 `list --status <pending|handled|no-action|all>`，默认 `pending`；支持重复 `--task` 作为交集过滤、`--limit` 和 `--include-report`。`limit` 默认 100，硬上限 500，不引入分页 cursor。匹配量超过 limit 时通过 `truncated` 和计数字段明确表达。

### 默认摘要，正文显式加入

每项默认返回 Task identity、Task status、完成时间、result/current digest、disposition 和 follow-up 摘要。只有 `--include-report` 才返回 `reportMarkdown`。批量结果按 Task ID 排序，避免 Workspace 更新时间造成输出抖动。

### 单项故障不使整批失效

匹配 Task 的单项 inspect 失败时，结果保留 item-level diagnostic 并继续其他 Task；输入非法或 Task query 本身失败才使整个 operation blocked。该行为只改善读取可用性，不修复或跳过损坏数据。

## Risks / Trade-offs

- [Application 内仍逐项读取，极大数据量下不是最优] → 先解决真实的 driver/context 成本；只有出现可测数据库瓶颈时再单独优化 repository。
- [显式包含正文仍可能产生大输出] → 默认关闭、限制最多 500 项，并由 Skill 指导先摘要后定向全文。
- [批量结果可能被误解为自动处置输入] → contract、Skill 和 schema 明确 `effects: []`，禁止分析、评分和 mutation。
