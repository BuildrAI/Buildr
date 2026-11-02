## ADDED Requirements

### Requirement: Task List CLI 必须提供稳定公开 JSON identity
`buildr task list --json` 成功时 MUST 返回 `buildr.task-record-list/v7` 顶层 identity，与 HTTP `GET /tasks` 共用同一 schema 与同一 Application query projection，MUST NOT 把列表结果包裹进 `buildr.task-record-result` 信封。响应 MUST 包含 `filters`、`filterOptions`、`totalTaskCount`、`matchingTaskCount`、`pageSize`、`hasMore`、`nextCursor`、`tasks` 与 `diagnostics`；`tasks` 每项 MUST 为不含 `brief` 的轻量视图。CLI 默认 `status=open` 与 `pageSize=20` MUST 在 `filters` 与分页字段中自描述，MUST NOT 只存在于帮助文本。输出 MUST NOT 暴露 database path、table、row id、SQL 或 storage internals；checkout 与 npm tarball CLI MUST 保持 schema parity。

过滤或分页输入被 Application 拒绝时，CLI MUST 沿用既有 Task CLI blocked 结果形态（`buildr.task-record-result` 的 `status: blocked`，`taskId` 为 `null`、`record` 为 `null`）表达稳定诊断 code、details 与 next action，并以非零退出码结束；MUST NOT 静默回退默认值、MUST NOT 返回部分列表、也 MUST NOT 为列表查询回读任何单个 Task。

#### Scenario: 默认查询的公开 identity
- **WHEN** 用户运行 `buildr task list --target <canonical-workspace> --json`
- **THEN** 输出顶层 `schemaVersion` MUST 为 `buildr.task-record-list/v7`
- **AND** `filters.status` MUST 为 `open`，`pageSize` MUST 为 `20`
- **AND** `tasks` 中 MUST NOT 出现 `brief` 字段，也 MUST NOT 出现数据库路径、表名或行标识

#### Scenario: 空结果与分页边界
- **WHEN** canonical Workspace 中没有匹配当前过滤条件的 Task，或匹配数量超过单页上限
- **THEN** 空结果 MUST 返回空 `tasks` 数组与真实的 `totalTaskCount`、`matchingTaskCount`，MUST NOT 返回 `null` 或省略闭合 schema 要求的字段
- **AND** 超出单页时 `hasMore` MUST 为 `true`，且 `nextCursor` MUST 可直接作为下一次 `--cursor` 输入取得下一页

#### Scenario: registry 与 parity 漂移
- **WHEN** `task list` command 已登记，但 public JSON family、关键字段 guard 或 checkout/npm parity fixture 缺失
- **THEN** static/package verification MUST 失败并指出缺失 identity，MUST NOT 允许命令可达而契约测试缺失
