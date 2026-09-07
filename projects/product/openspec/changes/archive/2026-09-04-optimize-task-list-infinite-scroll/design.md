## Context

Buildr Web 任务页是连续滚动的信息流。当前页面筛选后一次请求完整结果，客户端再进行关键词过滤和状态优先排序；后端虽然用固定批次数量的 SQLite 查询组装 Task，但随后又为每条 Task 解析 Project、Service、Worktree 与 OpenSpec Change 当前性。当前 Workspace 有 427 条 Task 和 269 个 stored Change reference，原始 SQLite 全量读取约 0.02 秒，而完整 `queryTasks` 超过 40 秒未返回。

现有 canonical spec 已要求列表投影只读取 SQLite stored state，并把实时 Change 解析留给具体 Change route。本变更先修复这一实现偏差，再为信息流增加有界的滚动续载。

## Goals / Non-Goals

**Goals:**

- Task 列表单次最多组装和返回 50 条记录。
- 用户浏览到每批约第 40 条时预取下一批，并无缝追加到现有信息流。
- 搜索、筛选、排序和匹配总数均以完整结果集为准，不退化为“只搜索当前已加载数据”。
- 续载期间保持确定顺序，不因相同时间戳产生重复或漏项。
- 列表查询不执行文件系统 registry、Git、Worktree 或 OpenSpec Change resolver。

**Non-Goals:**

- 不改成带页码的表格分页，也不增加用户可选的每页条数。
- 不引入虚拟列表、缓存、后台索引、全文搜索或数据库 migration。
- 不改变 Task 详情和具体 Change 页面上的实时引用解析。
- 不改变非分页 Application 调用当前返回全部匹配 Task 的兼容语义。

## Decisions

### 使用游标分页而不是页码偏移

分页请求使用固定 `pageSize=50` 与不透明 `cursor`。Repository 按 Web 当前语义生成确定顺序：`todo`、`active`、其他终态，再按 `updatedAt DESC, taskId ASC`；游标携带查询条件 identity 和最后一条排序键，下一批使用键集条件继续读取。

相比 `OFFSET`，游标不需要重复跳过前面所有行，也不会因为多条记录共享更新时间而产生不确定边界。游标只表达读取位置，不成为持久状态或第二 authority。非法、陈旧或与当前查询条件不匹配的游标返回封闭的输入错误；前端从第一批重新读取。

### 保持 Application 全量兼容，由 Web 显式选择分页

`queryTasks` 增加可选 `pageSize` 与 `cursor`。未传 `pageSize` 时继续返回全部匹配结果，保留现有内部调用与测试语义；Buildr Web 始终显式发送 `pageSize=50`。response schema version 升级为 `buildr.task-record-list/v6`，并增加 `matchingTaskCount`、`pageSize`、`nextCursor` 与 `hasMore`；原 `totalTaskCount` 继续表示 Workspace 全部 Task 数量。

这比静默把所有调用默认截断为 50 条更安全，也避免 Parent 候选或其他内部消费者在未适配时只看到部分结果。

### 列表只提供 stored-state projection

列表批次从同一个 SQLite read transaction 中完成过滤、匹配计数、排序、Task、scope、stored Change references 与直接关系组装。列表级 `referenceDiagnostics` 保持为空，不调用当前性 resolver；详情与 Change route 继续提供实时诊断。

分页不仅减少返回数据，也不被用来掩盖原有重型逐条解析。这样每批成本主要随最多 50 条 SQLite row 线性变化，而不是随 Git/worktree/archive 扫描放大。

### 第 40 条使用浏览器观察器触发预取

前端在每个已加载批次的第 40 条位置设置一次预取观察点；进入视口时，若 `hasMore` 且当前没有续载请求，就请求 `nextCursor`。响应只在 Workspace、筛选、已防抖关键词和请求代次仍匹配时追加，并按 `taskId` 防御性去重。

首次读取使用现有主加载态；续载只在列表底部显示局部加载或重试，不清空已显示任务。筛选、搜索或 Workspace 变化会取消当前请求、清空已追加批次并从首批重读。

## Risks / Trade-offs

- [用户停在第 40 条附近时可能重复触发观察器] → Hook 以当前 cursor 和 in-flight 状态去重，每个 cursor 只允许一个请求。
- [Task 在滚动期间被更新并跨过当前 cursor 边界] → cursor 保证静态结果集的确定边界，前端按 `taskId` 去重；刷新或改变筛选后读取最新事实，不为滚动会话复制历史快照。
- [50 条中存在大量 stored Change references] → 列表不再解析引用当前性，因此引用数量只影响 SQLite stored row 组装，不触发 Git 或目录扫描。
- [后续批次失败] → 保留已加载内容并提供局部重试；不把续载错误冒充整个列表读取失败。

## Migration Plan

1. 先扩展 Task HTTP schema、DTO、Application 与 repository，保留未分页调用兼容。
2. 增加分页、游标校验、轻量列表与数百条数据的回归测试。
3. 更新 Buildr Web Hook 和页面，接入 50/40 滚动续载、服务端搜索及请求代次保护。
4. 运行契约生成检查、定向 Node 测试、Web 构建与浏览器 Task 场景。

回退时前端可停止发送分页参数，Application 仍能按既有方式返回全量结果；数据结构没有迁移或持久化副作用。

## Open Questions

无。每批 50 条、约第 40 条预取和不生成界面原型已经由用户确认。
