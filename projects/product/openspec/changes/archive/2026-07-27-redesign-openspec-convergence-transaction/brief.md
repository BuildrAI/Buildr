# 重新设计 OpenSpec 确定性收敛事务

## 一句话摘要

将 Buildr 的 OpenSpec 收敛从多份阶段型 sidecar 与恢复状态机，重构为由 canonical before/expected 实际 digest 驱动的单一产品事务。

## 背景与问题

当前 `openspec converge` 已能自动完成 rehearsal、pre-sync、plan/apply、strict validation 与 post-sync，但 contract baseline、pre-sync receipt、sync plan、convergence receipt 和 recovery receipt 重复保存输入身份。输入变化会使多份状态同时过期，恢复需要回滚 canonical、重建 baseline 并选择内部阶段，Task Finish 和 Agent 因而承担了产品内部编排复杂度。

## 目标与非目标

目标是保留隔离验证、条件式原子写入、并发检测、写后确认、断点恢复和 `archive --skip-specs`，同时只持久化一份包含 before/expected facts 的 convergence receipt；任何中断都根据真实文件决定继续应用、写后确认、停止人工检查或重试归档。

本 Change 不修改上游 OpenSpec，不自动解决 Requirement 语义冲突，不合并或修改现有并发 worktree，也不重构 Task Finish 的 Git、验证和 runtime 政策。

## 受影响用户或角色

- 使用 Task Finish 完成 OpenSpec Change 的 Agent：正常路径只调用一个产品入口。
- 维护 Buildr 的开发者：通过独立 planner、validator、applier、observer 和 receipt 模块定位问题。
- 需要人工介入的用户：只在语义冲突或状态无法证明时收到明确停止原因。

## 核心流程

1. 产品解析 Change、active conflicts、delta、canonical 与 OpenSpec executable，生成单一 convergence identity。
2. 纯 planner 生成完整 before/expected plan；语义不唯一时零写入返回 blocked。
3. projected validator 在隔离 Project 执行 strict validation。
4. canonical applier 重验全部输入后条件式替换；observer用真实digest处理任何中断。
5. 写后确认通过后用 `archive --skip-specs` 归档；归档失败只重试归档。
6. Task Finish 只消费 passed、blocked 或 recovery-unprovable，并由轻量 bootstrap 保证损坏 domain 下仍可记录 checkpoint。

## 关键变化

- 新路径只写 `.buildr/convergence-receipt.json`，不写旧 baseline/pre-sync/plan/recovery sidecar。
- 恢复从“上次内部 stage”改为“当前 canonical 是否等于 before 或 expected”。
- Task Finish 不再参与 OpenSpec 内部阶段编排。
- 旧 sidecar 只读兼容；无法组成完整证明链时关闭式失败。
- checkpoint bootstrap 不依赖加载 OpenSpec domain。

## 影响、风险与兼容性

- 新正常路径会停止生成旧阶段型 sidecar，属于 CLI workflow 兼容性变化；旧命令暂时保留诊断能力。
- 多文件处于混合 before/expected 状态时不会自动回滚或补写，而是 `recovery-unprovable`。
- 两个不相交 Change 修改同一 spec 文件时，后者会因文件 digest 漂移重新规划，从而保留前者内容。
- 历史 archived sidecar 不批量迁移，package audit只禁止新路径继续生成。

## 验收摘要

必须通过正常、验证失败、并发漂移、进程中断、部分异常、delta/executable变化、幂等、归档失败、损坏 domain checkpoint、同Requirement冲突和不相交Change等完整journey；安全保证不弱于现有contract fixtures，且新路径只保留一个正式receipt。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [specs/](specs/)
- [tasks.md](tasks.md)
