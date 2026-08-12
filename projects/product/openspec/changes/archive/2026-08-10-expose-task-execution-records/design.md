## Context

Task Verification 与 Task Finish 已经通过同一个 Task Execution Record Application 保存 execution metadata 和受限正文，但当前内部 `inspect/list` 会返回包含 locator 的完整 domain record，正文 Store 也只支持 producer publish、完整性验证与 cleanup。Local App 目前只展示 Verification current Result 和 Finish current/terminal 摘要，无法解释多次执行、失败、重试和输出。

本 Change 跨 `buildr` HTTP/runtime 与 `buildr-web`，同时涉及本地文件读取安全。SQLite、正文目录、producer 和 retention/cleanup 语义保持不变。

## Goals / Non-Goals

**Goals:**

- 从同一 execution record authority 形成 portable list、detail 与 body-file read model。
- 支持 `all`、`verification`、`finish` 三种 Task-scoped 视图，并让 Verification/Finish 专业区块进入各自视图。
- 只读取 manifest 已声明的 closed filename，先验证 manifest、record identity、digest 与 size，再返回固定上限的 UTF-8 内容。
- 通过既有 bounded Local App read executor 执行查询，保持 HTTP 与 Web 不接触 SQLite 或文件路径。

**Non-Goals:**

- 不增加 execution resource Inventory、filesystem discovery、第二 metadata store 或 owner 状态复制。
- 不增加 CLI、cleanup、GC、Doctor、failure resolution mutation 或正文下载。
- 不改变 Verification Result、Finish current/terminal、retention 或 producer 行为。

## Decisions

### 1. Application 提供独立 portable read model

在既有 Task Execution Record Application 上增加 Task-scoped `list view`、`detail view` 和 `body file read`。它们复用 repository/body store，但不返回内部 operation result，且显式移除 `locator`、reserved quota、SQLite path 与 effect path。

替代方案是让 HTTP 删除内部 Result 的敏感字段；这会把安全投影复制到 interface，后续其他 reader 容易漏删，因此不采用。

### 2. 专业筛选只映射既有 owner

公开 filter 固定为 `all | verification | finish`：`verification` 映射 `task-verification`，`finish` 映射 `task-finish`。三种视图读取同一记录集合；不创建分类表、关联表或缓存。

替代方案是按 UI 文案或 kind 自由查询；当前 owner/kind 是 closed domain，开放任意组合没有价值且会扩大公共契约，因此不采用。

### 3. 正文读取使用 record identity 与 closed filename

请求必须同时携带 Task ID、record ID 和白名单 filename。Application 先证明 record 属于 Task 且正文状态为 available；body store 再从 record 派生 owned directory，完整读取并校验 manifest、entry 类型、文件集合、digest、size 和 metadata。响应只返回固定 512 KiB UTF-8 preview，并标明 stored size、digest、stored truncation 与 response truncation。

不接受 locator、绝对/相对 path、glob、range 或下载参数。cleaned tombstone 保留在列表/详情，但正文读取返回稳定 unavailable diagnostic。

### 4. Local App 复用 bounded read worker

read executor 扩展三项纯读 operation，并在 worker message 中只允许 closed `view`、`recordId`、`filename` 参数。HTTP 使用 Task-scoped routes 和 `no-store`，不直接打开 SQLite 或正文文件。

替代方案是在 HTTP 主线程直接调用 Application；正文完整性校验与大日志读取可能阻塞 loopback server，也会绕过现有容量边界，因此不采用。

### 5. Web 采用一个共享记录浏览器和多个入口

“证据”页展示统一记录浏览器，提供全部、Verification、Finish 三个筛选。Verification Result 区块提供进入 Verification 视图的按钮；Finish current/terminal 区块提供进入 Finish 视图的按钮。所有入口只切换同一浏览器状态，不维护第二份记录数据。

详情按需读取；正文文件只有用户展开时才读取。cleaned、open、attention 和失败记录均可见，正文不可用时显示原因，不把记录 outcome 当作当前 Result 或交付状态。

## Risks / Trade-offs

- [读取完整性验证会读取最多 16 MiB record] → 放入固定容量 Worker；HTTP 响应仍限制为单文件 512 KiB preview。
- [execution record metadata 可能包含面向内部的字段] → 由 Application closed portable projector 明确白名单，不序列化完整 domain record。
- [多入口可能让用户误认为有多套记录] → 三个入口使用同一 API 与同一 record identity，UI 明示筛选而非专业 authority。
- [cleaned tombstone 没有正文文件清单] → detail 明确 `body.available: false` 与 cleanup facts，不扫描目录恢复清单。

## Migration Plan

不需要 SQLite migration。发布顺序为：先增加 Application/worker/HTTP 与 schemas，再增加 Web 客户端，最后构建前端产物并更新 current knowledge。回滚可整体移除新增 read routes 和 UI；既有 execution records、producer 与 cleanup 数据不受影响。

## Open Questions

无。正文响应上限固定为 512 KiB，后续若需要下载或分页必须单独设计，不在本 Change 扩展。
