## Context

多仓 Task Finish 在 run identity 的每个适用 repository 上冻结 `leaseTargetIdentity = sha256({ retainedRoot, remote, targetBranch })`，Product executor 已按该值竞争 deliver lease。self-bootstrap detail projector 却只保留 `remote` 与 `targetBranch`，bundled runner 因而重算旧逻辑值 `origin:dev`。SQLite repository 会把它与冻结摘要比较并拒绝，造成 Formal Finish 与 post-Finish self-bootstrap 之间的契约断点。

这个断点还具有自举迁移约束：修复提交完成 Formal Finish 后，retained Workspace 在 sync 前仍运行旧的 rendered runner。若 Product authority 只接受新字段，修复本身和已有失败 run 都无法跨过第一次自举激活。因此需要既不降低 repository 隔离、又能让旧 runner 一次性迁移的受控兼容层。

## Goals / Non-Goals

**Goals:**

- 让 canonical Result、稳定 self-bootstrap 投影、runner plan、内部 driver 与 SQLite lease owner 使用同一个冻结 repository-scoped identity。
- 允许旧 runner 对 existing current/terminal run 传入 `remote:targetBranch` 时，只在唯一 repository 匹配可证明的条件下解析到精确 identity。
- 让 acquire、refresh、release 都验证 matching Workspace、Task、run、repository identity 与 token fencing。
- 以真实 terminal SQLite row 和真实内部 driver 验证 bundled runner，不再让全量 stub 掩盖接口漂移。

**Non-Goals:**

- 不恢复以 `remote:targetBranch` 作为新 run 的 canonical lease key。
- 不引入第二套 lease table、runner receipt、跨 Workspace lock 或多仓原子事务。
- 不修改公共 CLI 参数、Task Finish 五阶段、Task Environment repository set 或 self-bootstrap 唯一 runner ownership。
- 不自动恢复任意历史 run；只恢复调用方明确指定且 authority 能唯一证明的同一 run。

## Decisions

### 1. 精确 identity 从 frozen repository plan 单向投影

`task-finish-self-bootstrap-input/v1` 在每个 repository projection 上增加可选 `leaseTargetIdentity`；v3 Result 原样投影冻结值，legacy v2 singleton 则投影其既有 `remote:targetBranch` identity。Workspace repository 适用时，runner plan 必须取得该字段并原样传给 driver，不再从路径、remote 或 branch 重新摘要。

保持 `v1` major 并使用 additive 字段，是因为旧 runner 会忽略新增字段，而新 runner 仍能读取历史 v2 投影。另一个方案是发布 self-bootstrap input `v2`，但这会让旧 rendered runner 在迁移前直接拒绝，无法完成自举切换。

### 2. 兼容解析由 SQLite owner transaction 持有

target lease repository 在 matching current 或 terminal complete row 的事务内解析 requested identity：

1. requested identity 精确命中冻结 applicable repository identity 时直接使用；
2. 对仍以逻辑 target 为 canonical identity 的 legacy singleton，保持原行为；
3. 对 repository-set run 的旧 `remote:targetBranch` 请求，只筛选同时匹配 `remote`、`targetBranch` 且持有有效 `leaseTargetIdentity` 的 applicable repository；恰好一个命中时解析到其精确 identity；
4. 零匹配、多匹配、Task/run 不匹配、非 eligible row 或错误精确 identity全部拒绝。

兼容逻辑不放在 runner，是因为旧 runner 无法更新；也不由 driver 单独读取后再写入，因为 read/resolve/acquire 分离会产生 owner 漂移窗口。repository 返回 requested 与 resolved identity，driver 对旧 runner 保留 outward `targetIdentity=requested`，同时增加 `resolvedTargetIdentity` 和 resolution mode；新 runner 必须确认 resolved identity 等于 plan 的精确值。

### 3. release 使用 owner-aware 入口

内部 driver 的 release 不再只凭 `targetIdentity + token` 调用通用释放函数，而是使用 Task/run-aware repository operation，在同一事务中重建兼容解析并以 resolved identity、Task、run 与 token 条件删除 lease。Product executor 继续使用其已持有的 canonical lease object，不改变普通 deliver 路径。

这样旧 runner 可以用原 requested logical identity 释放实际持有的 repository-scoped lease，同时跨 run、错误 repository 或伪造逻辑 target 不能借兼容字段释放其他 owner。

### 4. 真实契约测试覆盖迁移链

测试必须至少建立一个 terminal complete v3 Finish row，由稳定 projector 产生 self-bootstrap input，再让 bundled runner 调用真实 `task-finish-target-lease-driver.mjs` 取得和释放精确 lease。兼容矩阵另外验证旧 logical identity 的唯一命中，以及零命中、多命中、错误 Workspace、Task/run 与精确 repository identity均 fail closed。

现有 runner 行为测试仍可 stub Git、sync、Launcher 与 Doctor；target lease 边界不得再只回显任意输入，因为那正是本次回归逃逸的原因。

## Risks / Trade-offs

- [兼容 outward identity 与实际 lease key 不同] → driver 同时返回 `resolvedTargetIdentity` 与 resolution mode；新 runner 强校验 resolved 值，旧 outward 字段只服务已有 runner。
- [两个 repository 使用同一 remote/branch] → 旧 logical 请求按多匹配拒绝，必须由新 runner 使用精确 identity；不猜测 Workspace selector。
- [历史 v2 Result 没有 repository hash] → 保持其原 logical identity，不伪造无法由冻结事实证明的摘要。
- [release 兼容扩大内部接口] → 仅内部 driver 使用 owner-aware release，所有解析基于 matching SQLite row 且仍受 token fencing。
- [真实 runner 测试准备成本增加] → 只把 target lease driver 与 SQLite authority设为真实边界，其他不相关外部动作保持确定性 fixture。

## Migration Plan

1. 先上线 projector、runner exact identity 与 SQLite/driver兼容解析，同一版本同时具备新旧 consumer 路径。
2. 用修复 Task 的 Formal Finish 验证旧 rendered runner 能通过唯一兼容解析完成首次 self-bootstrap sync。
3. retained Workspace 投射新 runner 后，后续 invocation 只使用 exact identity；再恢复明确指定的既有失败 run，不重跑其 Formal Finish。
4. 代码回退时，已投射新 runner 会在旧 Product authority 上 fail closed，因此回退必须同步恢复 compatible Product 与 runner；不降级或改写已有 v3 Result。

## Open Questions

无。
