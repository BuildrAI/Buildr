## Context

现有 Task Record、Environment、Development、Review、Verification、Retrospective 与 Finish 均有独立 Application/SQLite authority；`task_lifecycle_current` 已退役。Verification transient summary 与 Finish diagnostics 尚无统一、有限期的正式 Task execution record authority。本 Change 只建立共享底座，不接入任何 producer，也不把 execution resource 或专业 Result 纳入该模型。

底座需要同时跨越 SQLite 与文件系统：SQLite 适合索引与状态约束，stdout/stderr/diagnostics 正文会放大 WAL 和备份成本，必须保存在 Workspace-local 受限目录。两者不能组成单一原子事务，因此状态与恢复边界必须显式。

## Goals / Non-Goals

**Goals:**

- 定稿单张 `task_execution_records` 表的 closed 字段、状态约束、唯一键与查询索引。
- 提供唯一 Task Execution Record Application，支持 open、seal、inspect/list、resolution 与单记录 cleanup。
- 在 producer execution 前以最大 record 边界预留配额；正文写入前完成脱敏、截断和路径防护。
- 让文件 publish 与 metadata seal 可恢复：只有可读正文才能成为 retained，失败保留可识别 attention 现场。
- 为后续 Verification/Finish 接线提供窄 port，不建立通用 payload、event/history 或 Consumer/Adoption。

**Non-Goals:**

- 不新增 CLI、Local App、Task Overview、Doctor 或批量 GC surface。
- 不迁移旧 Verification/Finish 临时内容，不接入任何 producer。
- 不创建 `task_execution_record_consumers`、`task_facts`、execution resource 表或 lifecycle 聚合。
- 不允许调用方自定义 TTL、配额、cleanup shell、owner 或 kind。

## Decisions

### 1. Domain 使用一条 closed record，而不是通用日志条目

一条 record 绑定真实 `task_id`、closed `owner/kind`、`run_identity`、`target_identity` 与 `producer`。v1 owner/kind 仅允许：

- `task-verification / verification-execution`
- `task-finish / finish-diagnostics`

`record_id` 由 Application 生成；`(task_id, owner, kind, run_identity)` 唯一，用于 open 幂等。Outcome 只允许 `running|passed|failed|blocked|cancelled`。这让未来 producer 通过明确契约扩展，避免把 arbitrary event、tag 或 JSON payload 塞入表中。

### 2. 单表字段按 identity、body、quota、retention 四组保存

`task_execution_records` 使用 STRICT table，字段为：

- identity：`record_id`、`schema_version`、`task_id`、`owner`、`kind`、`run_identity`、`target_identity`、`producer`；
- lifecycle：`outcome`、`lifecycle_status`、`resolution_status`、`body_status`、`quota_status`；
- body：`body_locator`、`body_digest`、`stored_size_bytes`、`original_size_bytes`、`truncated`、`redaction_version`、`reserved_size_bytes`；
- time/cleanup：`retain_until`、`opened_at`、`sealed_at`、`resolved_at`、`cleanup_started_at`、`cleaned_at`、`cleanup_code`、`updated_at`。

状态组合由 SQL CHECK 与 Domain normalization 双重约束：open 必须是 running/staging/reserved；retained/cleanup_pending 必须有 terminal outcome 与完整 body identity；cleaned 必须释放 quota、清空 locator 但保留 digest/size/tombstone；失败类 outcome 在 cleanup 前必须 resolved。Task foreign key 使用非级联约束，Task terminal transition不会删除 record。

索引围绕实际读取不变量建立：Task 时间线、Task-owner-kind 最近记录、owner/lifecycle retention 扫描和 Workspace/Task-owner quota 计算。SQLite 不保存正文或任意 JSON payload。

### 3. open 时按 16 MiB record 上限预留配额

Application 在同一 `BEGIN IMMEDIATE` transaction 中查询未释放 quota charge：open record按 `reserved_size_bytes` 计费，sealed record按 `stored_size_bytes` 计费。新 record 固定预留16 MiB；若加入后超过同一 Task/owner 256 MiB或Workspace 2 GiB，则在 producer execution 启动前返回 backpressure，不创建 row 或 staging directory。

单文件4 MiB与单record16 MiB在正文 writer 内执行。调用方不能降低或覆盖上限。该方案比执行后再决定保留更安全，也不需要另建 quota/lease 表。

### 4. 正文 Store 使用受限 staging 与原子 publish

正文根固定为 `.buildr/local/task-execution-records/<owner>/<record-id>/`。writer 只接受 closed 文件名 `summary.json|stdout.txt|stderr.txt|timeline.json|diagnostics.json` 和 UTF-8/JSON 内容；拒绝绝对路径、父级跳转、symlink、非 regular file 与重复文件。

writer 在写入 staging 前应用 `buildr.task-execution-record-redaction/v1`：覆盖 Bearer/credential/secret/private-key 模式，canonical Workspace path 转为 `<workspace>`，其他未经授权绝对路径转为 `<redacted-path>`。原始 bytes 只计数，不落盘。超过限制时在 UTF-8 boundary 截断；JSON 使用保持有效 JSON 的 truncated envelope。文件 fsync 后 rename 到 final directory，再由 repository seal metadata。

若 rename 后 metadata transaction 失败，final directory保留 `.record-manifest.json` 作为可识别 attention 现场；Application尽力把 row标为attention，不能成功时错误仍返回精确record/locator供后续恢复。重试 seal 只复用匹配 manifest/digest 的 final directory，不覆盖未知内容。

### 5. Retention/cleanup 先提供单记录 owner-neutral primitive

Application 计算产品固定 `retain_until`：passed 7天，failed/blocked/cancelled 30天。passed cleanup 还必须不属于同一 Task/owner/kind最近3次；失败类还必须 resolution 为 `acknowledged|recovered`。open与attention不自动清理。

eligible cleanup先把 lifecycle CAS为`cleanup_pending`，再由正文 Store删除精确 owned directory，最后写 cleaned tombstone并保留 digest/size/producer/cleanup code。批量选择、最近20条与90天 metadata purge由后续 GC Child Task实现；本 Change只提供可测试的 eligibility与单记录原子状态边界。

## Risks / Trade-offs

- [SQLite与文件系统无法单事务提交] → final manifest、幂等 publish、attention状态与CAS cleanup让每个部分失败可识别、可重试。
- [正则脱敏遗漏跨chunk secret] → v1 writer在内存中只处理已受16 MiB record边界限制的完整输入，先整体脱敏再落盘；后续 producer接线不得绕过writer。
- [固定文件名限制未来producer] → v1只覆盖已知Verification/Finish正文形态；新增文件类型必须修改closed contract和测试，避免任意文件绕过配额。
- [每个open预留16 MiB降低并发容量] → 这是有意的保守backpressure，确保execution开始后一定拥有最大记录边界；seal后立即按stored bytes计费。
- [候选runtime不能升级retained SQLite] → migration tests在Task validation Workspace执行；正式Finish后由retained writable runtime前向升级，旧runtime按database-newer fail closed。

## Migration Plan

1. 根据当前 migration loader 的 latest version 增加下一连续 SQL script，创建单张表、checks和indexes；不修改既有 migration bytes。
2. 注册 Domain、filesystem Store、SQLite repository与Application composition，不暴露CLI或producer。
3. 覆盖fresh初始化、从每个既有ledger连续升级、FK/rollback、closed schema、quota、redaction、truncation、atomic publish和cleanup恢复测试。
4. Change收敛后由正常Formal Finish交付；canonical Workspace首次合法写入时应用前向migration。无down migration。

## Open Questions

无。v1 owner/kind、容量、retention与操作集合均由父Change冻结；未来producer需求通过后续Child Change扩展。
