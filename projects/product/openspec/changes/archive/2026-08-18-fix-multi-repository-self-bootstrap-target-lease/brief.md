# 修复多仓 Task Finish 自举 Lease 契约

多仓 Task Finish 已使用 repository-scoped target lease identity，但 post-Finish self-bootstrap 仍传递旧的 `remote:targetBranch`，导致 Formal Finish 完成后自举激活在任何副作用前失败。本变更让稳定 self-bootstrap 投影和 bundled runner 复用 Workspace repository 的冻结 exact identity，并为已经存在、仍由旧 runner 调用的 run 提供唯一匹配才成立的受控兼容恢复。

## 背景与问题

Formal Finish Product executor 已在每个适用 repository 上按 retained root、remote 与 target branch 形成摘要 identity。稳定 projector 未投影该值，旧 closeout runner 因而传入 `origin:dev`。SQLite authority 按冻结 repository identity fail closed 是正确行为，但生产者与消费者未同步升级，形成自举契约断点，也使已完成的历史 run 无法收尾。

## 目标与非目标

- 目标：贯通 canonical Result、稳定投影、runner plan、内部 driver 与 SQLite owner 的同一 exact identity。
- 目标：旧 logical target 只在 matching Workspace/Task/run 内唯一命中一个 applicable repository 时兼容解析。
- 目标：真实验证 terminal Finish SQLite authority 与 bundled runner 的完整 lease 获取、刷新和释放链。
- 非目标：不恢复 shared `remote:branch` canonical lease key，不新增 lease store，不改变公共 CLI、五阶段或多仓 delivery 顺序。

## 受影响角色与核心流程

受影响的是 Buildr 自举 Workspace 的 Task Finish owner。普通 Workspace 不安装 self-bootstrap Component，行为不变。Formal Finish 仍先完成；随后唯一 runner 从 self-bootstrap detail 取得 Workspace repository exact identity，在每个 activation 副作用前通过 retained Product driver 持有同一 lease。历史旧 runner 只能通过唯一匹配兼容跨过第一次 sync，不能猜测 repository。

## 关键变化

- self-bootstrap input `v1` additive 投影 `leaseTargetIdentity`。
- 新 runner 原样使用 exact identity并校验 driver resolved identity。
- SQLite owner transaction执行唯一 legacy解析；release 同样绑定 Task/run与token。
- 回归测试不再让 target lease stub 无条件回显任意输入。

## 影响、风险与兼容性

兼容 outward result 保留旧 requested identity，并新增 resolved identity供新 runner 校验。两个 repository 共用同一 remote/branch 时旧调用会明确失败，必须使用新 exact identity。legacy v2 singleton 继续使用其原 logical canonical identity。无 SQLite migration、公共 Result major 或用户操作迁移。

## 验收摘要

- v3 self-bootstrap projection 精确保留 Workspace repository lease identity。
- bundled runner 通过真实 driver 在 terminal row 上取得并释放 exact lease。
- 唯一旧 logical target 可恢复；零匹配、多匹配、跨 Workspace、跨 Task/run、错误 exact identity 或 token 全部零副作用拒绝。
- 受影响测试、strict OpenSpec validation 与正式 verification 全部通过。

## 技术 Artifacts

- [设计](design.md)
- [Task Finish delta spec](specs/task-finish-execution/spec.md)
- [Self-bootstrap closeout delta spec](specs/task-closeout-orchestration/spec.md)
- [实现任务](tasks.md)
