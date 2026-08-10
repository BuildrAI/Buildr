## ADDED Requirements

### Requirement: ExecRecord GC 必须按既有 authority 执行 bounded Workspace 回收
Task Execution Record Application MUST 提供 Workspace 级 ExecRecord GC，接受 closed `dryRun` 与 `limit`，并 MUST 只从 `task_execution_records` 选择候选。一次运行 MUST 有固定默认与最大 batch，MUST 优先恢复 `cleanup_pending`，再复用既有 retention、resolution、recent-count 与单记录 cleanup 处理 eligible retained 正文；MUST NOT 扫描文件系统、建立第二 GC store、自动处置 failure resolution、猜测 open record 已死亡或管理 execution resources。

#### Scenario: dry-run 计算候选
- **WHEN** caller 对 Workspace 执行 dry-run GC
- **THEN** Application MUST 按真实 current rows 和固定规则返回 bounded 候选与 action 摘要
- **AND** MUST NOT改变 record lifecycle、删除正文或删除 metadata

#### Scenario: bounded batch 清理 eligible 正文
- **WHEN** Workspace 同时存在多条 eligible retained 或 cleanup_pending records 且数量超过 limit
- **THEN** GC MUST 按稳定顺序最多处理 limit 条，并对正文 cleanup 复用单记录 CAS 与 owner-bound deletion
- **AND** 未选择记录 MUST 保持不变，单条失败 MUST NOT回滚或阻塞其他已选择记录

#### Scenario: 不可自动清理的 record
- **WHEN** record 仍为 open/attention、retention 未到期、recent-count 受保护，或 failure resolution 仍 pending
- **THEN** GC MUST 不选择该 record 执行 mutation
- **AND** MUST NOT通过时间、目录状态或调用方 override 改变其 disposition

### Requirement: ExecRecord GC 必须有限期保留 cleaned tombstone
ExecRecord GC MUST 对 cleaned metadata 应用固定 tombstone retention：`cleanedAt` 未满 90 天或仍属于同一 Task/owner/kind 最近 20 条 cleaned records 时 MUST 保留；两项保护均失效后 MAY 通过 expected-current 条件删除该 row。Tombstone purge MUST NOT删除或改写 Task、Verification Result、Finish current/terminal 或其他专业事实。

#### Scenario: tombstone 仍受时间保护
- **WHEN** cleaned record 距 `cleanedAt` 未满 90 天
- **THEN** GC MUST保留其 metadata
- **AND** MUST将它排除在本次 purge mutation 外

#### Scenario: tombstone 仍受最近次数保护
- **WHEN** cleaned record 已满 90 天但仍属于同一 Task/owner/kind 最近 20 条 cleaned records
- **THEN** GC MUST保留其 metadata
- **AND** MUST NOT因 Workspace 积压或 quota 状态删除它

#### Scenario: tombstone 到期删除
- **WHEN** cleaned record 已满 90 天且不再属于最近 20 条，且 mutation 时 current row 仍与已选择事实一致
- **THEN** GC MUST只删除该 `task_execution_records` row
- **AND** 并发变化时 MUST返回 skipped/conflict 而不是删除不同 current state

### Requirement: ExecRecord GC 结果必须 portable 且有界
ExecRecord GC MUST 返回 stable operation result，至少包含 mode、limit、扫描/选择/cleaned/purged/skipped/failed counts、每个已选择 record 的 identity、action、status 与 portable diagnostic。结果 MUST bounded by batch limit，MUST NOT包含 SQLite path、body locator、本机绝对路径、正文、secret 或任意 cleanup shell。

#### Scenario: 部分失败结果
- **WHEN** batch 中一条 record cleanup 失败而其他 records 成功
- **THEN** 顶层结果 MUST表达 partial 状态并分别列出成功与失败 action
- **AND** MUST不返回失败 record 的正文 locator 或底层数据库路径
