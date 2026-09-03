## Context

当前 Task Record 是 canonical Workspace SQLite 中的唯一顶层任务事实，Review、Verification、Retrospective、Worktree、Preview、OpenSpec、Git、发布和自举已经具有独立 owner。剩余问题集中在三处：Task Overview 重复聚合已有读模型；Task Record 仍保存 `noChange`、行级 schema version 和反向 Child 投影等非必要数据；`task-manager` Skill 把确定性接口操作与父任务协调方法混合。

当前数据库 migration 为 0030。`terminal_contribution_reconciliations` 只剩 2 行且没有运行时 reader/writer；`legacy_parent_plan_json` 有 10 行并仍作为明确历史展示。用户已确认删除前者，保留后者但不让历史内容参与当前判断。

## Goals / Non-Goals

**Goals:**

- 让 Task Record 只保存不可替代的业务事实，所有 mutation 使用同一种并发保护。
- 删除没有独立事实、安全或消费者价值的 Task Overview。
- 统一父任务协调（Task Parent Coordination）术语，不在本 Change 改造 Skill 体系。
- 通过单一连续 migration 收敛真实 Workspace 数据，不建立兼容表或双写。
- 让 current specs、knowledge、CLI、HTTP、Web、生成 DTO 和测试表达同一当前事实。

**Non-Goals:**

- 不重新设计 Task Review、Task Verification、Task Retrospective、Worktree、Preview、Project preparation、release 或 self-bootstrap 的既有职责。
- 不创建统一任务流程、`proceed / blocked`、Task Candidate、Handoff、Task Environment、交付历史或第二事实源。
- 不删除、新增或重命名任务相关 Skill，不调整 capability provider/binding；Buildr Skills 的整体审查是后续独立目标。
- 不修改 archived Changes 或把旧任务结果当作当前产品事实。

## Decisions

### 1. 删除 Task Overview，而不是继续修补聚合结果

Task detail 已返回 Task Record、直接关系和复盘引用；Review 与 Verification 已有独立 GET。Overview 的唯一生产消费者是 Buildr Web，且页面随后仍读取专业详情。删除独立查询可同时移除重复 SQL、开放 DTO、固定 `userSummary` 和永远为空的 diagnostics。

前端直接从 Task detail 渲染目标与真实结果。专业状态只在证据页按需读取，不把旧 outcome 摘要冒充当前性。

未选择“把 Overview 合并成更大的后端详情”，因为这会继续耦合独立专业 owner，并让每次打开 Task 都读取不需要的结果。

### 2. Task Record result 只保存 summary

`noChange` 不能跨代码、文档、外部系统和发布场景稳定表达成果，也不能证明交付。完成结果只保留 `summary`；需要说明“无需修改”时写入摘要。self-bootstrap 必须以调用方提供的精确 `deliveredRef`、remote readback 和 Git identity 判断交付。

未保留 enum/result kind，因为当前没有必须按结果类型查询的消费者。

### 3. 正向关系持久化，反向关系查询派生

只在 Child row 保存 `parent_task_id`。`childTaskIds`、Child summaries 和计数全部从该关系查询生成，并只存在于 relation/query projection。`isParent` 继续保存，因为它表达用户声明的聚合目标，即使尚未建立 Child 也必须保留完成授权边界。

Task `recordDigest` 只绑定该 Task 自身持久业务事实。父任务完成另用 snapshot identity 绑定直接 Child 的完成相关事实。

### 4. 所有 mutation 都使用 compare-and-set

create 由唯一 Task ID 保护；update、activate、complete、abandon 和复盘状态更新必须提供当前 `recordDigest`。CLI 与 HTTP 使用相同输入规则。冲突后由 Agent 重新读取和判断，不自动重放。

终态更正继续保存 `resultHistory`。从本 Change 起新增的历史 entry 同时保存旧 scope、Change 和 `isParent`；既有 entry 缺少这些字段时原样保留并明确为历史信息不完整，不推断旧值。

### 5. 本 Change 只统一父任务协调术语

当前 Skill 是否应与 Application 解耦、`task-manager` 是否保留，以及是否需要独立父任务协调 Skill，会影响整个 Buildr Skill 和 capability provider 模型。本 Change 不局部决定这些问题。

实现只把当前产品说明中的“父子任务管理”统一为“父任务协调（Task Parent Coordination）”；`task-manager`、现有 provider/binding 和其他任务 Skills 保持当前结构，等待后续全量 Skill 只读审查。

### 6. 历史数据只保留真实消费者

`terminal_contribution_reconciliations` 没有受支持 consumer，使用 migration 直接删除表和 2 行数据，不备份、不迁移。

`legacy_parent_plan_json` 仍提供明确标注的历史查看，因此保留；Parent current `isParent` 和完成 snapshot 不再读取它。旧 Contribution Handoff 和 planned binding parser 没有 current consumer，连同专属测试直接删除。

### 7. 生成 DTO 仍只有一个生成源

删除 Overview schema 后，将 Review、Verification、Parent Coordination response 定义为 closed JSON Schema。生成器继续从该唯一 catalog 生成后端和前端 DTO；不手工维护两份类型。

## Risks / Trade-offs

- **破坏现有 `/overview` 或 Skill ID 消费者** → 当前仓库只发现 Buildr Web、受管 Skill 和测试消费者；同步删除所有受管入口并通过 fresh package/runtime 验证。仓库外旧客户端收到 404，不提供兼容转发。
- **删除 `noChange` 影响旧任务读取** → migration 保留 result summary 和状态，只删除布尔分类；历史 summary 不改写。
- **历史 `resultHistory` 无法补全旧 scope** → schema 允许既有 entry 缺少新增字段；只保证新更正完整，不猜测历史。
- **父任务 completion snapshot 过窄遗漏相关变化** → snapshot 保留 Parent 当前目标、scope、Change、Parent identity，以及每个直接 Child 的 ID、目标、scope、status 和 result；排除复盘、历史展示和专业可选结果。
- **SQLite migration 不可逆** → 用户已确认删除旧贡献协调 2 行数据；migration 在单事务中升级，旧 runtime 按 database-newer-than-runtime 失败。

## Migration Plan

1. 先删除 Overview 消费者与模块注册，调整 Buildr Web 直接使用 Task detail。
2. 修改 Task Record Domain/Application/CLI/HTTP 与 self-bootstrap consumer，更新唯一 schema source并生成 DTO。
3. 新增 migration 0031，重建 `tasks` 表并删除 `terminal_contribution_reconciliations`；保留 scope/Change、Parent、Review、Verification、legacy Parent Plan 和 retrospective facts。
4. 删除 dead code/tests，更新受影响验证 owner。
5. 收敛 current specs、knowledge、architecture、glossary、父任务协调术语和用户文案；不改 Skill 结构。
6. 运行 strict OpenSpec、类型、Task 单元/集成/系统、Buildr Web build/browser、fresh/upgrade SQLite 和 capability/runtime 组合验证。

回滚不提供 down migration。未集成候选只能在当前 checkout/test fixture 验证；只有包含 0031 的 retained runtime 才能升级 canonical Workspace。

## Open Questions

无。Task Overview、`noChange`、旧贡献协调数据删除、术语统一和不制作 UI Prototype均已由用户确认；Skill 体系重构明确不属于本 Change。
