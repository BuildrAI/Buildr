## ADDED Requirements

### Requirement: 正式 Local HTTP Server 必须整点调度 ExecRecord GC
Buildr 正式 Local HTTP Server MUST 在 ready 后注册 Workspace scheduled maintenance：从下一个本地整点开始、之后每个本地整点取得当前 Workspace Registry 快照，并对每个已登记且可用的 canonical Workspace 调用默认 bounded ExecRecord GC。Scheduler MUST单进程防重入、隔离各 Workspace 失败、在 server close 时释放 timer，并 MUST直接调用 Application 而不是启动 CLI 子进程或保存第二份 run history。

#### Scenario: 正式 server 到达整点
- **WHEN** 非 preview 的 Local HTTP Server 已 ready 且到达下一个本地整点
- **THEN** scheduler MUST 对当前已登记 Workspace 各执行一次默认 bounded ExecRecord GC
- **AND** 单个 Workspace 失败 MUST NOT阻止其余 Workspace 或下一整点运行

#### Scenario: 上一批仍在运行
- **WHEN** 新整点到达时上一轮 scheduled maintenance 尚未完成
- **THEN** scheduler MUST跳过并发重入
- **AND** MUST NOT创建第二个 timer worker、GC lease 或持久队列

#### Scenario: server 关闭
- **WHEN** Local HTTP Server 开始关闭或触发 close
- **THEN** scheduler MUST取消后续 timer
- **AND** MUST NOT在 server 终止后启动新的 GC batch

### Requirement: Task Preview Server 必须禁用 scheduled maintenance
Buildr Task Preview Server MUST 在创建任何 scheduled maintenance 之前根据显式 preview identity 禁用调度。Preview MUST NOT注册 ExecRecord GC timer、执行 startup GC 或在后台读取/修改 Workspace execution records；该边界 MUST适用于直接 server factory 测试与由 `BUILDR_LOCAL_APP_PREVIEW` 启动的真实 preview。

#### Scenario: Task Preview 启动并持续运行
- **WHEN** Local HTTP Server 以有效 preview identity 启动并跨过一个或多个整点
- **THEN** server MUST从未创建或调用 scheduled maintenance scheduler
- **AND** execution record SQLite rows 与正文 MUST不因 preview 进程而变化

#### Scenario: 正式 server 与 preview 并存
- **WHEN** 默认 Local HTTP Server 和 Task Preview Server 同时运行
- **THEN** 只有默认正式实例 MUST拥有 scheduled maintenance
- **AND** preview MUST不共享、接管或补跑正式实例的 timer
