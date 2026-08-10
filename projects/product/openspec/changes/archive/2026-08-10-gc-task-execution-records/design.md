## Context

Task Execution Record Application 已提供固定 retention、recent-count 保护、failure resolution 门禁、`retained → cleanup_pending → cleaned` CAS 与单记录正文 cleanup。Domain 还固定了 cleaned tombstone 保留 90 天、同一 Task/owner/kind 最近 20 条保护，但目前没有 Workspace 级候选选择、批量执行或 metadata purge。

Buildr Local App 是一个长期运行、可登记多个 Workspace 的本地 HTTP Server；Task Preview 使用同一 server factory，但携带 `previewIdentity` 并服务于测试和任务验证工作区。本设计必须让正式 server 承担轻量定时维护，同时保证 preview 启动完全没有后台数据 mutation。

## Goals / Non-Goals

**Goals:**

- 在同一 Task Execution Record Application 中形成可 dry-run、可限定数量、可部分成功的 Workspace GC。
- 恢复 `cleanup_pending`，清理当前 eligible 的 retained 正文，并删除到期且不受 recent-count 保护的 cleaned tombstone。
- 提供手动/headless CLI；正式 Local HTTP Server 在下一个本地整点开始、之后每小时运行一次。
- Preview Server 不创建 timer、不触发 GC；server close 时释放 timer，单进程内不并发重入。

**Non-Goals:**

- 不扫描 `.buildr/local` 发现未知目录，不修复 body/metadata 不一致，也不猜测 open record 已死亡。
- 不自动把 failure resolution 改为 acknowledged/recovered，不清理 Environment、Git、Verification transient 或 Finish Carrier 等执行资源。
- 不接入 Workspace Doctor，不新增 GC store、queue、run history、lease 或 SQLite migration。
- 不提供 Local App GC 按钮、HTTP mutation route 或 C6 的记录读取/UI。

## Decisions

### 1. GC 作为现有 Application 的 Workspace operation

新增 `gcTaskExecutionRecords(targetRoot, { dryRun, limit })`。它只通过 repository 查询已有 rows，并对正文候选复用公开的单记录 `cleanupTaskExecutionRecord`。这样 eligibility、CAS、owner-bound body deletion 与 cleaned tombstone 写入仍只有一个实现。

替代方案是单独建立 GC service/store；这会复制 retention 和状态转换 authority，因此不采用。

### 2. 候选顺序固定且每条独立收敛

一次运行最多处理 closed `limit` 条记录，默认 100、允许 1–500。顺序固定为：最早进入的 `cleanup_pending`、最早到期的 eligible retained、最早到期的 cleaned tombstone。候选选择只读 SQLite；真正 mutation 前仍由单记录 cleanup 或 tombstone compare-and-delete 重验 current row。单条冲突或失败进入 bounded result，其余候选继续，避免一条损坏记录阻塞整个 Workspace。

`dryRun` 执行同样的候选计算但不进入 cleanup、不删除 metadata。返回 selected action、record identity 与理由的 bounded 投影，不返回 locator、SQLite path 或正文内容。

替代方案是一个跨文件系统和 SQLite 的大事务；正文删除无法参加 SQLite transaction，且会放大锁时间，因此不采用。

### 3. tombstone 只在双重保护失效后删除

cleaned record 的 `cleanedAt` 至少满 90 天，且它不属于同一 Task/owner/kind 按 `cleanedAt` 倒序的最近 20 条时，才可删除 metadata。Repository 使用 expected current record 做条件删除；并发变化或已删除按稳定 skipped/conflict 返回，不误删新状态。

recent-count 保护继续保留可解释的近期 cleanup 历史；GC 不把 tombstone purge 解释为 Task、Verification 或 Finish 事实删除。

### 4. CLI 是唯一公开 mutation 入口

新增：

```text
buildr task execution-record gc [--target <canonical-workspace>] [--dry-run] [--limit <1..500>] [--json]
```

CLI 直接调用 Application；`--json` 输出 stable portable result，非 JSON 输出一行摘要。它不接受 Task ID、owner、path、retention override、force 或 failure resolution 参数，避免把 Workspace policy 变成调用方策略。

### 5. 正式 server 整点调度，preview 在注册前关闭

新增独立的 in-process scheduler adapter。正式 `createLocalWorkspaceServer` ready 后计算到下一个本地整点的延迟，随后每小时取得 Workspace Registry 当前快照并逐个调用 Application 默认 bounded GC；同一 scheduler tick 未完成时跳过下一次 tick。Workspace 失败彼此隔离，结果只进入进程诊断，不建立持久 run history。

当 `previewIdentity` 非空时，server factory 在创建 scheduler 前判定 scheduled maintenance disabled：不调用 scheduler factory、不创建 timer、不执行 startup GC。server close 会清除正式实例 timer。

替代方案是在 Preview 环境中运行 dry-run，或只依赖 `BUILDR_LOCAL_APP_PREVIEW` 环境变量；前者仍引入后台读锁与时序噪声，后者在直接 factory 测试时不可靠，因此使用显式 `previewIdentity` 作为 server 边界，并由现有环境解析负责传入。

### 6. Doctor 不读取 execution record 业务数据

Workspace Doctor 继续检查 source/runtime/projection 等 Workspace 技术事实。GC 的 per-record failure 由 CLI/scheduler result 表达；本 Change 不增加 Doctor check、修复动作或数据层巡检。

## Risks / Trade-offs

- [正式 server 停止时没有后台 GC] → CLI 提供手动/headless 入口；下一次正式 server 运行可继续收敛。
- [多个进程或 CLI 与 scheduler 同时运行] → 单记录 cleanup CAS、tombstone expected-row delete 和 SQLite writer serialization 保证安全；批次允许稳定 conflict/skipped。
- [大量积压需要多个小时] → 每次固定 bounded，手动 CLI 可重复运行；不以无界批次换取一次清空。
- [系统时钟跳变影响整点] → 每次 tick 后重新计算下一本地整点，不依赖长期固定 interval 漂移。
- [单条正文损坏持续失败] → 结果保留 record identity 与 portable diagnostic，GC 不越权扫描或修复；由明确后续任务处理真实缺口。

## Migration Plan

不需要 SQLite migration。先增加 repository/Application 与 CLI，再接入 scheduler，最后更新 specs/current knowledge。回滚可移除 CLI 与 scheduler；已有 rows、正文、retention 和单记录 cleanup 完全兼容。发布后首次 GC 只会处理当时已满足既有规则的记录。

## Open Questions

无。默认/最大 batch 固定为 100/500，scheduler 只在本地整点运行，Task Preview Server 不注册任何 scheduled maintenance。
