## 1. ExecRecord GC Core

- [x] 1.1 增加 Workspace 候选查询、tombstone recent-rank 与 expected-current delete repository primitives，保持单表和无 migration
- [x] 1.2 实现 dry-run/bounded GC Application operation，优先恢复 cleanup_pending、复用单记录 cleanup，并隔离单条失败
- [x] 1.3 增加 Domain/Application/repository tests，覆盖 retention、resolution、recent-count、tombstone、并发冲突、partial 与无文件系统 discovery

## 2. CLI Contract

- [x] 2.1 实现 `task execution-record gc` closed 参数解析、portable JSON schema 与简洁文本摘要
- [x] 2.2 增加 CLI contract/system tests，覆盖 dry-run、limit、partial result、非法策略输入和敏感路径缺失

## 3. Local HTTP Server Scheduler

- [x] 3.1 实现从下一本地整点开始的单进程防重入 scheduler，按 Workspace Registry 快照直接调用 bounded GC 并在 close 时停止
- [x] 3.2 在 server factory 的 preview identity 边界禁用全部 scheduled maintenance，不创建 timer 或 startup GC
- [x] 3.3 增加 scheduler/server tests，覆盖正式整点、多 Workspace 失败隔离、防重入、关闭与 Task Preview 跨整点零 mutation

## 4. Knowledge and Direct Validation

- [x] 4.1 收敛 Change Brief、Buildr Service current knowledge、terminology 与 knowledge-impact evidence，只记录真实 GC/Preview/Doctor 边界
- [x] 4.2 运行 OpenSpec strict validation、受影响 unit/integration/system tests、CLI smoke 与 Local App preview scheduler-disabled 验证并修复直接反馈
- [x] 4.3 确认全部 apply tasks 完成且 canonical convergence 已具备前置条件
