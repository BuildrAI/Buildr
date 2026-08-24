# 修复失败 Finish run 的显式对账恢复

一句话摘要：当旧 Finish run 在 delivery 前失败并只遗留 Buildr 可证明 ownership 的隔离 carrier，而 current Development Handoff 已由真实远端完整包含时，让显式 reconciliation 能安全清理旧 occupancy 并登记当前 Delivery。

## 背景与问题

普通 Finish run 必须保护 carrier、lease 和下游恢复事实，不能在 Handoff 变化后自动换绑。当前 `task finish reconcile` 复用了同一 identity conflict 门禁，在旧 run 已 terminal failed、没有 delivery 副作用时也无法利用真实远端包含证据闭合任务，造成永久 occupancy。

## 目标与非目标

目标是增加一条只属于显式 reconciliation 的 fail-closed 恢复路径：先证明 current Handoff 的全部 repository contribution 已被远端包含，再证明旧 run 没有下游副作用并安全清理 run-owned carrier，最后形成 current Handoff 的 terminal Delivery。

非目标包括放宽普通 `task finish run` 的 supersede、安全删除任意目录、复用旧 carrier 证明新 Candidate、自动执行 Git delivery，或改变 Development/Verification/Review authority。

## 受影响角色与核心流程

直接受影响的是处理外部 Git/PR 交付和 Finish 异常恢复的 Agent。Agent 仍调用同一个 `task finish reconcile --task <id>`；产品在 identity 冲突时执行 current containment → old-run eligibility → carrier cleanup → terminal persistence 的封闭顺序。

## 关键变化

- current Handoff 的远端包含证明先于任何旧 carrier mutation。
- 只接受 terminal failed、prepare 停止、后续 phase untouched 且无 lease/delivery/retained/completion/cleanup/resume 的旧 run。
- carrier cleanup 复用精确 worktree ownership primitive，部分效果可见且可幂等重试。
- 成功 terminal result 绑定 current Handoff，并关联但不改写旧失败 Execution Record。

## 影响、风险与兼容性

主要风险是多 repository carrier cleanup 无法原子完成；通过先完成全部远端证明、保持旧 current row、逐 repository 报告 effects 与幂等重试控制。现有普通 run、identity-matched reconciliation 和不满足资格的旧状态保持兼容。

## 验收摘要

成功场景必须登记 current Handoff 的 terminal Delivery并完成 Task；未包含、旧 run 有下游事实、repository set 漂移、ownership/cleanup 失败必须保持旧 current run。普通 run 遇到 carrier identity conflict 的回归行为不变。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specification](specs/task-finish-execution/spec.md)
- [Implementation tasks](tasks.md)
