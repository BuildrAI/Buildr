## Why

Verification 与 Finish 已经把每次正式执行写入同一 Task Execution Record authority，但目前这些记录只能由内部 Application 读取，用户无法在 Task 中查看失败、重试、输出与多次执行历史。现在需要开放一个安全、稳定、只读的查询面，并让 Local App 从统一入口和两个专业区块查看同一批记录。

## What Changes

- 为 Task Execution Record 增加按 Task 列表、单条详情和 `all | verification | finish` 专业筛选的只读查询。
- 增加按 record identity 与 closed filename 读取正文的受控接口；只允许 manifest 已声明的白名单文件，执行完整性校验与响应大小限制，并对 cleaned、缺失或损坏正文返回稳定状态。
- 登记不含 SQLite、locator、本机绝对路径或任意文件路径的稳定公共 JSON。
- 在 Local App Task 详情增加统一执行记录视图，并从 Verification、Finish 区块提供各自筛选后的入口和记录展示。
- 不建立通用执行资源 Inventory，不扫描文件系统，不复制 Verification Result 或 Finish current/terminal 事实，也不提供 cleanup、GC 或删除动作。
- 不包含破坏性变更；现有 Verification、Finish 与 Task API 保持兼容。

## Capabilities

### New Capabilities

<!-- 无新增 capability；本 Change 只扩展现有 Task Execution Record 与 Local App 能力。 -->

### Modified Capabilities

- `task-execution-artifacts`: 增加安全、只读、按 owner family 筛选的记录列表、详情与正文读取契约。
- `public-json-contracts`: 登记执行记录查询与正文读取的稳定 portable JSON identity 和安全字段边界。
- `local-workspace-application`: 增加 Local App HTTP 的 Task-scoped 执行记录只读端点与 bounded read execution。
- `local-app-web-client`: 增加统一、Verification、Finish 三种执行记录视图及专业区块入口。

## Impact

- `product/buildr`：Task Execution Record Application/body store、Local App read worker、HTTP routes、JSON schemas 和测试。
- `product/buildr-web`：Task 详情 API client、类型、路由/页签组件和前端测试。
- OpenSpec/current knowledge：更新上述四个 capability，并把 Buildr Service 当前说明从“尚未注册 Local App”收敛为已开放受限只读查询。
- 不新增 SQLite migration、表、writer、后台扫描器或跨 owner 资源聚合。
