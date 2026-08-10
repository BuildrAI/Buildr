## ADDED Requirements

### Requirement: Local App HTTP 必须开放 Task-scoped execution record 只读接口
Local App HTTP interface MUST 在解析已登记 Workspace 后提供 Task-scoped execution record list、detail 与 body-file GET。List MUST 只接受 closed `view=all|verification|finish`，detail/body MUST 同时验证 record 属于 route Task；所有响应 MUST 使用 `no-store`。HTTP interface MUST 只调用 Task Execution Record Application，MUST NOT 直接查询 SQLite、读取 locator、扫描文件系统或提供 mutation。

#### Scenario: 按 view 查询记录
- **WHEN** browser 请求 Task execution record list 且 view 合法
- **THEN** HTTP MUST 返回 Application 的 portable list read model
- **AND** 未提供 view 时 MUST 使用 `all`

#### Scenario: 查询 detail 与正文
- **WHEN** browser 请求 Task-scoped record detail 或受支持 filename
- **THEN** HTTP MUST 通过 Application 验证 Task/record/file identity 后返回 portable JSON
- **AND** MUST NOT 接受 body、locator 或 path query

#### Scenario: 非法查询参数
- **WHEN** request 包含未知 view、未知 filename 或额外查询字段
- **THEN** HTTP MUST 在读取 record body 前返回 closed-input diagnostic

### Requirement: Execution Record 读取必须进入 bounded Local App read executor
Local App bounded read executor MUST 登记 execution-record list、detail 与 body-file 三项纯读 operation，并 MUST 以 closed Worker message 传递已解析 Workspace root、Task ID 和 operation 所需最小参数。Executor MUST 保持既有固定 Worker/queue 容量、取消和 failure isolation 语义，且 MUST NOT 承载 execution record mutation、cleanup、GC 或 Doctor。

#### Scenario: 正常读取
- **WHEN** HTTP 提交合法 execution record read operation
- **THEN** bounded executor MUST 在 Worker runtime 调用同一 Application 并返回其 read model

#### Scenario: 队列饱和或取消
- **WHEN** executor 队列已满或 request 被取消
- **THEN** request MUST 使用既有 bounded-read diagnostic 结束
- **AND** MUST NOT 在 HTTP 主线程回退执行正文读取
