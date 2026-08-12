# 建立任务执行记录底座

## 一句话摘要

先为正式 Task 建立不接 producer 的执行记录单一 authority，让后续 Verification 与 Finish 能共享受限正文、配额、保留和清理基础，而不复制专业事实或执行资源。

## 背景与问题

Buildr 已把 Task current/terminal facts 和 execution resources 分配给专业 Application，但正式执行产生的完整输出与诊断仍散落在 transient 目录或专业 payload 中。缺少统一的 metadata/body 生命周期会导致不可理解的保留、重复 registry 和难以证明的清理。

## 目标 / 非目标

目标是建立 closed Task Execution Record Domain/Application、单张 SQLite metadata 表、受限 Workspace-local 正文 Store、写入前脱敏、固定容量/backpressure 与可恢复 retention/cleanup 状态。

本次不接入 Verification/Finish producer，不建立 Consumer/Adoption、通用 event/history、execution resource writer、CLI、Local App、Doctor 或批量 GC。

## 受影响用户或角色

- 后续 Verification/Finish producer：通过窄 Application port open/seal record。
- Agent 与产品维护者：从 closed metadata 和明确 next action 判断记录状态。
- 后续 Inventory/GC：只消费 Application read model 与 owner-neutral cleanup primitive。

## 核心流程

1. registered producer在execution前open record并预留16 MiB容量。
2. producer只把受控正文交给Application writer；writer在落盘前脱敏、截断并原子publish。
3. Application把open record seal为retained或attention，并保存relative locator、digest与size事实。
4. retention条件满足后，单记录cleanup先CAS为cleanup_pending，再删除owned body并保存cleaned tombstone。

## 关键变化

- 新增`task_execution_records`连续migration和repository。
- 新增Task Execution Record Domain/Application与filesystem body Store。
- 固定owner/kind、状态组合、配额与retention常量。
- 增加Domain、Store、Application、repository与migration测试。

## 影响 / 风险 / 兼容性

SQLite与文件系统不能单事务提交，使用staging、manifest、attention与幂等恢复处理部分失败。migration只前向新增，旧runtime读取新数据库继续fail closed。候选runtime只升级自身Task validation store，不写retained canonical store。

## 验收摘要

- closed Domain/SQL checks拒绝未知owner/kind、非法状态和任意payload。
- quota在producer execution前backpressure；正文限制为4 MiB/16 MiB且raw secret/path不落盘。
- fresh/连续migration、FK/rollback、atomic publish、retention与tombstone行为有自动测试。
- 没有producer接线、Consumer/Adoption、execution resource或lifecycle聚合回归。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task execution artifacts spec](specs/task-execution-artifacts/spec.md)
- [Workspace structured data store delta](specs/workspace-structured-data-store/spec.md)
- [Implementation tasks](tasks.md)
