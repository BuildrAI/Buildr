## 1. Task Query 分页契约

- [x] 1.1 扩展 Task list HTTP schema、生成 DTO 与输入校验，支持可选 `pageSize`、不透明 `cursor`、`matchingTaskCount`、`hasMore` 和 `nextCursor`
- [x] 1.2 在 SQLite repository 实现状态优先、更新时间与 Task ID 的稳定排序、匹配计数和键集分页，保留未分页调用兼容
- [x] 1.3 让 Task Query Application 只组装当前批次 stored state，移除列表中的 Project、Service、Git、Worktree 与 Change resolver 当前性读取

## 2. Buildr Web 信息流续载

- [x] 2.1 将 Task 搜索词与全部筛选条件统一提交服务端，查询变化时取消陈旧请求并重置为首批 50 条
- [x] 2.2 重构 Task list Hook，区分首批加载与后续追加，按 cursor 去重并保留后续失败时的已加载内容和重试能力
- [x] 2.3 在任务信息流每批第 40 条设置预取观察点，自动追加下一批且在最后一批停止观察

## 3. 测试与当前认知

- [x] 3.1 增加 Task Query 单元/系统回归，覆盖数百条分页、相同时间戳边界、游标校验、完整匹配数量、未分页兼容及列表零实时 resolver 调用
- [x] 3.2 增加 Web Hook/页面与浏览器回归，覆盖 50/40 自动续载、服务端搜索、筛选重置、交错响应、局部失败和最后一批
- [x] 3.3 运行生成契约检查、定向 Node 测试、Web 测试与生产构建，修复直接反馈
- [x] 3.4 对照最终规范与实现完成 Brief、知识影响和术语影响 reconcile，确认无需更新其他 current knowledge
