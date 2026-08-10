# 自动回收任务执行记录

## 一句话摘要

让现有 Task Execution Record retention 从“有规则、有单次 cleanup”补齐为可手动、可定时、有限批次的 Workspace GC，同时保证 Task Preview Server 完全不启动后台维护。

## 背景与问题

Task Execution Record 已有固定 retention、failure resolution、recent-count 保护、单记录 cleanup 和 cleaned tombstone，但没有 Workspace 级候选选择、批量执行、tombstone 到期删除或自动触发。长期运行后正文和 metadata 会持续积累，而用户只能逐条调用内部 Application。

## 目标 / 非目标

目标是提供 dry-run 与 bounded ExecRecord GC、手动/headless CLI、正式 Local HTTP Server 整点调度，以及 Task Preview Server 明确禁用 scheduled maintenance。

本次不让 Workspace Doctor 检查业务 rows，不扫描文件系统，不自动处置失败记录或推断 open record 死亡，不清理 Environment/Carrier/Git 等执行资源，也不建立第二套 GC store 或 Local App UI。

## 受影响用户或角色

- 本地 Buildr 用户与自动化：通过 CLI 预览或执行 Workspace GC。
- 正式 Local App：在长期运行时按整点执行小批量维护。
- Task Preview 与测试：获得不会启动后台 mutation 的稳定运行边界。

## 核心流程

1. GC 从现有 SQLite authority 选择 bounded candidates。
2. 先恢复 `cleanup_pending`，再按既有规则调用单记录 cleanup。
3. cleaned tombstone 满 90 天且不在同类最近 20 条时，条件删除 metadata。
4. 正式 Local HTTP Server 从下一个本地整点调度；Preview Server 不创建 timer。
5. CLI 与 scheduler 都直接调用同一个 Application operation。

## 关键变化

- 增加 Workspace GC repository queries 与 Application operation。
- 增加 `buildr task execution-record gc` CLI 和 portable JSON。
- 增加正式 server scheduler、关闭清理与 preview-disabled gate。
- 增加 retention/tombstone/partial/concurrency/preview zero-mutation tests。

## 影响 / 风险 / 兼容性

不需要 SQLite migration，现有 producer 和单记录 cleanup 保持兼容。多个进程并发时依靠既有 CAS、expected-current tombstone delete 与 SQLite writer serialization；大量积压通过多个 bounded batch 渐进收敛。

## 验收摘要

- dry-run 零 mutation，正式 batch 有固定默认/最大数量并允许 partial。
- retention、resolution、recent-count 和 tombstone 保护不可被 CLI 覆盖。
- 正式 server 在整点调用 GC；Preview 跨整点仍零 timer、零 SQLite/正文变化。
- 结果不泄漏 locator、绝对路径、SQLite 或正文；Doctor 无新增业务数据检查。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task execution artifacts delta](specs/task-execution-artifacts/spec.md)
- [Local workspace application delta](specs/local-workspace-application/spec.md)
- [Public JSON contracts delta](specs/public-json-contracts/spec.md)
- [Implementation tasks](tasks.md)
