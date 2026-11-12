## Why

程序接入 events 补查在流末尾返回 `nextCursor=null`，轮询方按文档用 `after=nextCursor` 续读时没有可用游标，只能重新从 0 开始或停止补查。需要让每一页都返回可保存的续读游标，并明确后续是否还有事件。

## What Changes

- `nextCursor` 始终返回本页最后一条事件的 sequence 字符串；空页回显请求的 after；未传 after 且没有事件时为 null。
- 响应新增布尔字段 `hasMore`，表示以 `after=nextCursor` 再次读取时是否还有更多事件。
- `/help`、`operations/events` 与 OpenAPI 说明轮询方保存 `nextCursor` 并用 `after=nextCursor` 继续补查。
- 覆盖末尾页、空页、无事件、有更多事件和非法游标的测试。

## Impact

- 不改变事件类型、正文、持久化保留期或回推投递行为。
- events 响应新增必填 `hasMore`，`nextCursor` 语义变为稳定续读位置。
