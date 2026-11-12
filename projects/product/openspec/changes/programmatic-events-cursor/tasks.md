## 1. 修复

- [x] 1.1 events 的 nextCursor 对非空页返回最后一条事件 sequence；空页回显 after；无 after 且无事件返回 null。
- [x] 1.2 events 响应新增 hasMore，按 nextCursor 之后是否还有事件计算。
- [x] 1.3 同步 /help、operations/events、OpenAPI 与响应 schema。
- [x] 1.4 覆盖末尾页、空页、无事件、有更多事件与非法游标测试。

## 2. 验证与交付

- [x] 2.1 定向与全量检查通过，OpenSpec strict 与 spec-change-consistency 通过。
- [x] 2.2 推送 origin/dev，开发版 4458 运行新代码并完成 events 游标冒烟。
