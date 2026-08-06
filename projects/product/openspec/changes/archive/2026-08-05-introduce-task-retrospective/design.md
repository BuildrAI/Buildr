## Context

现有 `task-asset-review` 是一个过程型 optional capability：Agent 在任务执行中维护文件 observation，Task Development 在 handoff 前 finalize，并可能等待人工 accept/reject。这个模型扩大了每个非简单任务的默认工作量，也把“提升当前 Agent 执行效率”与“长期资产沉淀”绑在一起。

Buildr 已有 Workspace SQLite、Task Record current model、Application/repository 分层和 Local App Task detail tabs。第一版复盘可以复用这些成熟边界，不需要建立新的任务事件系统。

## Goals / Non-Goals

**Goals:**

- terminal Task 只保存一份聚焦 Agent 执行效率的当前复盘。
- Agent 基于当前可见证据识别耗时、token 或重复尝试的高成本点，并给出可执行优化建议。
- SQLite 是唯一持久化位置，Application 是唯一读写 authority。
- Local App 在 Task 详情中只读展示当前复盘。
- 完整退役当前 `task-asset-review` 能力及所有 active routing/gates，同时保持旧数据原样。

**Non-Goals:**

- 不采集隐藏推理、完整对话、工具日志或任务事件流。
- 不自动计算 token/耗时，不要求所有 Agent runtime 暴露统一 telemetry。
- 不保存历史、revision、候选、评分、标签、结构化优化项或跨任务聚合。
- 不把复盘加入 Development、Finish、cleanup 或 terminal transition 门禁。
- 不迁移、读取或删除 `.buildr/asset-review/`。

## Decisions

### 1. 使用单一 current row，而不是复盘历史模型

新增 `task_retrospective_current`，以 `task_id` 为主键，保存 closed Result JSON。`record` 在事务内完整替换同一 Task 的旧值，`inspect` 返回当前值或 absent。

选择整值 JSON 是为了与 Task Development/Review/Verification current repositories 保持一致，并让第一版 schema 可由 domain 一处校验。替代方案是拆分 report 字段或设计 revision/history 表；它们会提前引入查询、迁移和并发语义，当前没有需求。

### 2. Result 只含固定 focus 与自由 Markdown

Result 使用 `buildr.task-retrospective-result/v1`：`taskId`、固定 `focus: agent-execution-efficiency`、`reportMarkdown`、`completedAt`。不把成本点、原因、建议拆成强制字段，避免模板反过来限制 Agent 的推理空间。

Skill 给出轻量提示：优先检查时间和 token 高成本点、重复尝试、等待/阻塞、可前移的人机选择，以及 Buildr workflow/harness 可优化之处。精确数字只有在当前上下文可见时才写；否则报告数据缺口。

### 3. 只允许 terminal Task 写入，但复盘不是状态门禁

Application 在写入前通过 Task Record Application 确认 Task 为 `completed` 或 `abandoned`。这样复盘针对完整执行过程，同时不会改变 Task 状态。Task 完成/放弃操作不检查复盘，Development/Finish 也不依赖它。

替代方案是在任务过程中持续记录 observation；这正是本次要删除的额外负担。

### 4. Application 唯一写入，Skill 使用内部 driver

`task-retrospective` Skill 是语义执行者，负责生成报告；内部 driver 只调用 Application `record|inspect`，不新增公共 CLI。Local App 只调用 `inspect` read model，不提供写 UI。

这保持 Agent 判断与确定性存储分离，也避免 Local App、Skill 和 repository 出现多个 writer。

### 5. 旧资产审查做代码级退役，不做数据迁移

从 package manifest、contracts、bindings、Skills、consumer requirements、产品入口、静态验证和 tests 中移除 `task-asset-review`。根 `.gitignore` 对 `/.buildr/asset-review/` 的保护暂时保留，避免旧数据意外进入 Git；运行时代码不再读取或修改该目录。

历史 OpenSpec archives 保留为历史证据，不纳入 residual failure。current specs 与 current product docs 必须不再把旧能力描述为有效。

## Risks / Trade-offs

- [自由 Markdown 不利于自动统计] → 第一版优先验证真实使用价值；结构化字段和跨任务聚合留到后续迭代。
- [Agent 可见的耗时/token 证据不完整] → Skill 必须区分事实、推断和数据缺口，不伪造精确数字。
- [旧 observation 仍占用本地空间] → 保留 `.gitignore`，不触碰用户数据；未来若设计清理工具需另行授权。
- [删除 capability 可能残留 consumer/routing] → package/static/doctor 与 residual tests 同时扫描 active source、manifest 和 runtime projection。
- [terminal Task 写入限制会阻止过程内草稿] → 这是刻意边界；第一版只做完整任务后的复盘。

## Migration Plan

1. 先增加 SQLite migration、domain/Application/repository 与只读 Local App API。
2. 增加 `task-retrospective` contract、provider、binding、Skill 和 package verification。
3. 同一候选中移除旧 `task-asset-review` active assets、dependencies、routes 和 tests，保留 `.gitignore` 与旧数据。
4. 更新 current specs/docs/knowledge，运行 fresh/continuous migration、repository、Local App、package、runtime 与 residual 验证。
5. 失败时回滚整个候选代码；不需要恢复或转换用户数据，因为旧 observation 未被触碰。

## Open Questions

无。历史、多维结构、自动 telemetry 和跨任务飞轮均保留为后续独立 Change。
