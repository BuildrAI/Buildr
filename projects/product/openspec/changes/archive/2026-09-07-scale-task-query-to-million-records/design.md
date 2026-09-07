## Context

Task 列表当前已经使用 50 条键集分页，但底层以 `CASE status ... ORDER BY` 扫描并临时排序全部候选；Project/Service 过滤先把全部匹配 `task_id` 读入内存再构造 `IN (...)`；关键词使用 `instr(lower(...))`。在当前 400 余条 Task 上可接受，但这些成本随完整数据集增长，百万级时会触发全表排序、参数上限和内存放大。

Buildr 是本机 standalone 产品，canonical Workspace SQLite 继续拥有 Task authority。目标不是引入远程数据库或缓存系统，而是让 SQLite read model 使用生产级索引、查询规划和有界组装。

## Goals / Non-Goals

**Goals:**

- 默认信息流覆盖全部 Task，顺序固定为 `active → todo → completed → abandoned`；状态内按 `updated_at DESC, task_id ASC`。
- 首批、下一批和深游标分页只读取 51 个主 row identity，并批量组装前 50 条。
- Project、Service、Child、复盘和关键词过滤直接在 SQLite 中求交，不生成完整 Task ID 数组。
- 百万条 Task 及代表性关系/搜索数据上取得可复核的真实耗时、查询计划、内存和数据库体积证据。
- 百万级基准保持显式、隔离、可清理，不进入任何日常或发布门禁。

**Non-Goals:**

- 不承诺未来新增任意排序、聚合、跨 Workspace 查询或多人高并发仍无需重新评估。
- 不引入 PostgreSQL、Elasticsearch、后台 daemon、远程服务或第二事实源。
- 不把百万条 fixture 加入 changed、core、candidate、release 或 Browser 流程。
- 不优化与 Task 列表无关的 SQLite 表和业务能力。

## Decisions

### 单一可索引四态排序

新增与默认排序表达式完全一致的 SQLite expression index：

```sql
CASE status
  WHEN 'active' THEN 0
  WHEN 'todo' THEN 1
  WHEN 'completed' THEN 2
  WHEN 'abandoned' THEN 3
END,
updated_at DESC,
task_id ASC
```

默认/all/open 首批查询使用该索引稳定前进；单状态过滤仍可使用已有 `(status, updated_at DESC, task_id)` 索引。跨状态续载从游标所在状态开始，按当前及后续状态执行最多4个有界键集查询，每次只读取当前页剩余容量再合并，避免深游标的跨状态`OR`从索引前部扫描。选择 expression index 而不是持久化 `status_order` 字段，避免复制可从 status 确定派生的业务事实和重建 `tasks` 表。

游标升级内部版本并保存查询 identity、四态 rank、`updatedAt`、`taskId`、首批 `totalTaskCount` 与 `matchingTaskCount`。后续批次不重复执行 count；任一筛选或 pageSize 变化都会使旧 cursor 无效。

### 独立 Task list read repository

新增窄的 `task-list-repository.ts`，只拥有 Task 列表跨表读取模型：

```text
Task HTTP
  → Task Query Application
      → TaskListRepository：过滤、排序、count、51个边界 row
      → TaskRepository：批量读取最多50个 Task
      → Project/Service/Change repositories：批量组装最多50条关系
      → TaskRepository.relations：批量组装直接父子摘要
```

Command repositories 继续各自拥有 `tasks`、`task_projects`、`task_services`、`task_changes` 的写入；列表 repository 只读这些 authority 表，不成为第二 authority。它返回 `taskId/statusRank/updatedAt` 边界投影，不复制 Domain Task 映射。

Project/Service 使用相关 `EXISTS` 和已有关系索引求交；Child 使用 `tasks_parent_task_idx`；复盘使用已存在字段与索引。任何条件都保留参数绑定。

### FTS5 trigram 派生搜索索引

新增 external-content FTS5 trigram 表，以 `tasks.rowid` 对齐 authority row，并用 insert/update/delete triggers 在同一 SQLite transaction 中维护。Migration 创建、回填并校验索引；索引损坏时可从 `tasks` 重建，不改变 Task Record。

普通关键词的每个有效分词必须至少包含 3 个 Unicode 字符，才能保证 trigram 索引路径；存在不足 3 个字符的分词时零写入拒绝并提示继续输入。`#<完整-task-id>` 保留精确 ID 查询，不受最短关键词限制。该边界用于避免百万级数据上的任意 1–2 字符子串全表扫描。

关键词按现有分词后的 AND 语义生成安全 quoted MATCH expression；SQL 参数绑定与 FTS grammar escaping 分开处理，不能把用户输入拼成 MATCH 程序。

### 首批元数据与后续批次分离

Task list response 升级 schema：首批返回 `filterOptions`、`totalTaskCount` 和 `matchingTaskCount`；cursor 后续批次复用首批计数并返回 `filterOptions=null`。Web Hook 只在非空时更新筛选项，不因续载覆盖首批元数据。

这样滚动请求只执行主分页与当前 50 条批量组装。首批 exact count 仍可能随选择性条件扫描候选，但只发生一次；百万级 benchmark 单独测量首批与续载，不用续载速度掩盖首批统计成本。

### 性能证明与日常正确性分离

日常测试只包含：

- 小数据行为测试：四态跨页、游标、过滤、FTS 同步、迁移和并发变化。
- 查询计划测试：断言默认路径命中 feed index、单状态命中 status index、关系过滤不物化完整 ID、目标查询没有 OFFSET 或全表临时排序。

独立 `benchmark:task-query-million` 命令才创建 1,000,000 条临时 Task 与代表性关系/搜索数据，记录环境、准备耗时、数据库体积、首批/续载/深游标/结构过滤/关键词查询的冷暖数据和 P50/P95。该命令不登记到 verification registry、package 默认脚本链、CI 或 release workflow；即使 benchmark 超出观察目标，也先报告真实 timing，不把环境波动冒充正确性失败。

本次在当前开发机显式运行一次。目标观察值为：暖态默认/续载/结构过滤 P95 不超过 200ms，三字符以上关键词首批 P95 不超过 500ms；准备百万条数据的时间不计入查询延迟。

## Risks / Trade-offs

- [FTS5 增加数据库体积和 Task 写成本] → 使用 external-content trigram 索引，只维护 title/intent/task_id；百万级基准记录体积和批量写入成本。
- [最短三字符改变短关键词体验] → 保留完整 Task ID 精确搜索，并在 Web 搜索框明确提示；这是保证百万级无扫描的必要边界。
- [expression index 依赖 SQL 表达式精确一致] → 把表达式常量和查询计划断言集中在 Task list repository，migration SQL 由契约测试核对。
- [复杂过滤选择性极低时 feed index 仍需跳过较多 row] → 关系条件使用 indexed EXISTS；百万级 benchmark 覆盖稀疏 Project/Service 和深游标，不只测无过滤首页。
- [滚动期间 Task 更新跨过游标] → 客户端继续按 Task ID 去重；刷新读取最新事实，不为信息流保留长事务或复制快照。
- [SQLite/Node 构建缺少 FTS5] → Migration 前由 runtime capability check fail closed；固定 Node 24.15.0 已验证提供 SQLite 3.51.3 FTS5。

## Migration Plan

1. 新增连续 migration，创建 feed expression index、FTS5 external-content table、同步 triggers 和现有 Task 回填。
2. 增加 Task list read repository，迁移分页、过滤、count 和查询计划职责；Application 只负责编排与 DTO。
3. 升级 HTTP schema/DTO 和 Buildr Web 默认状态、搜索边界、首批/续载元数据处理。
4. 补齐小数据行为、migration、FTS 同步和 query-plan 日常测试。
5. 实现显式百万级 benchmark，在当前机器运行一次并保存本次 Change 的受控摘要，不注册为日常验证入口。
6. 完成当前认知、严格验证和 convergence 后交付；正式自举首次打开现有 Workspace 时由 retained runtime 原子应用 migration。

Migration 任一步失败必须回滚，保留旧 schema 和 Task 数据；已应用 migration 不修改历史 bytes。代码回退不能删除已经创建的可重建索引，必须通过后续连续 migration 处理。

## Open Questions

无。默认四态顺序、百万级 standalone 目标、显式非日常 benchmark 和不使用界面原型已经确认。
