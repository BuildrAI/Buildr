## MODIFIED Requirements

### Requirement: 持久化与序号补查
系统 SHALL 持久保存事件 7 天，服务重启后序号连续。系统 SHALL 提供 `GET /api/v1/programmatic/workspaces/{workspaceId}/events?after={cursor}&limit={n}`（read 权限，limit 默认 50、最大 200），按序号升序返回该凭据可见的事件，含未送达事件。`after` MUST 为上一页 nextCursor 返回的非负整数序号；不是合法游标时 MUST 返回 400 programmatic_input_invalid。`nextCursor` MUST 始终返回本页最后一条事件的 sequence 字符串；本页为空时 MUST 返回请求中的 after；未传 after 且没有任何事件时 MUST 为 null。响应 MUST 包含布尔字段 `hasMore`，表示以 `after=nextCursor` 再次读取时是否还有更多事件。轮询方 MUST 保存 `nextCursor` 并用 `after=nextCursor` 继续补查。事件被丢弃时系统 MUST 补发 `events_dropped`。

#### Scenario: 重启序号连续
- **WHEN** 服务重启后继续产生事件
- **THEN** 序号 MUST 接续重启前的最大值，不重置

#### Scenario: 补查含未送达
- **WHEN** 凭据以 after 游标读取 events
- **THEN** 系统 MUST 按序号升序返回该凭据可见事件（含未送达），limit 默认 50、最大 200

#### Scenario: 末尾仍可续读
- **WHEN** 本页包含事件且已到当前流末尾
- **THEN** nextCursor MUST 为本页最后一条事件的 sequence 字符串，hasMore MUST 为 false

#### Scenario: 空页回显游标
- **WHEN** 请求带 after 且该游标之后没有事件
- **THEN** events MUST 为空数组，nextCursor MUST 等于请求的 after，hasMore MUST 为 false

#### Scenario: 无事件首次读取
- **WHEN** 请求未带 after 且该凭据在此工作空间没有任何事件
- **THEN** events MUST 为空数组，nextCursor MUST 为 null，hasMore MUST 为 false

#### Scenario: 非法游标
- **WHEN** 请求的 after 不是非负整数序号
- **THEN** 系统 MUST 返回 400 programmatic_input_invalid，MUST NOT 当作 0 静默补查
