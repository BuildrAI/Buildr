## Why

当前 Task 信息流虽然已经按 50 条游标分页，但默认仍只查未结束任务，跨状态排序使用不能命中现有索引的 `CASE` 全量排序，Project/Service 过滤还会先加载全部匹配 Task ID，关键词使用无索引子串扫描。这些机制在数百条记录下可用，却不能作为 standalone 产品面向百万级 Task 的长期查询基础。

## What Changes

- Buildr Web 默认查询全部 Task，并固定按“进行中、待办、已完成、已放弃”顺序分页；每个状态内按更新时间倒序、Task ID 正序稳定排序。
- Task Query 使用单一键集游标和可索引状态排序，不使用 `OFFSET`、全表临时排序或跨页内存合并。
- Project、Service、Child 与复盘过滤直接进入 SQLite 分页 SQL，不再先读取完整 Task ID 集合。
- 关键词查询使用 SQLite FTS5 派生全文索引；Task SQLite 仍是唯一 authority，索引随 Task 写事务同步并可从 authority 重建。
- 首批计算完整匹配数量，后续批次复用游标携带的计数；筛选选项只在首批计算和返回，避免每次滚动重复全量统计。
- 新增独立百万级性能基准：只通过显式命令运行，在系统临时目录创建并清理数据；不得进入日常 changed、core、candidate、release 或 Browser 验证。
- 日常回归只使用小型行为夹具和 `EXPLAIN QUERY PLAN` 检查，证明目标索引、无 `OFFSET`、无临时全量排序和无全量 ID 物化。
- **BREAKING** Buildr Web 默认状态由 `open` 改为 `all`，Task 信息流排序从“待办、进行中、终态混排”改为四态固定顺序；Task list 响应契约将同步升级。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-record`: Task query projection 增加百万级可索引分页、SQL 原生关系过滤、FTS5 关键词索引、首批统计和显式性能基准边界。
- `buildr-web-workspace-application`: Task 信息流默认展示全部四态，按“进行中、待办、已完成、已放弃”跨批稳定续载，并只消费首批筛选元数据。
- `workspace-structured-data-store`: Workspace SQLite 增加可重建 Task 搜索索引、同步触发器和目标排序索引，保持迁移完整性与单一 authority。
- `product-verification-quality`: 百万级性能基准作为显式非日常入口，与日常行为/查询计划验证分离。

## Impact

- `product/buildr` Service：SQLite migration、Task list read repository、Task Query Application、HTTP schema/DTO、显式 benchmark 和验证。
- `product/buildr-web` Service：默认过滤、分页 Hook 的首批/后续元数据消费和 Browser 行为。
- 不新增外部数据库、后台服务、缓存 authority 或常驻索引进程；FTS5 使用当前固定 Node 24.15.0 所带 SQLite 能力。
