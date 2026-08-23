# 安全换代过期 Task Finish run

## 一句话摘要

让 Agent 在新 Candidate 尚未交付远端时，也能显式、安全地清理完全由 Product 生成且未被修改的旧 carrier，并原子创建绑定 current Handoff 的新 Finish run。

## 背景与问题

统一 Finish facts 已能识别旧 run 的 identity、phase、side effects、topology 与 carrier ownership，但旧 run 退休仍依赖 current Handoff 的真实 remote containment。当原 Task worktree 误改并形成新 Candidate、而新贡献尚未交付远端时，旧 current row 会持续阻塞自动 Finish；直接放宽退休条件又可能删除 Agent 已在 carrier 中完成的适配工作。

## 目标与非目标

目标是补充 carrier 可丢弃性证明、共享恢复资格和显式安全换代原语，使 Agent 可以在严格无副作用、内容未漂移和 current-row fence 下启动新 run。

不自动删除历史或证据不足的 carrier，不让普通 `run` 静默换代，不放宽 reconciliation 的远端证明，不让 `task next` 执行策略，也不跨 generation 复用旧研发或交付证据。

## 受影响角色

- Agent：在 Finish facts 明确证明安全时选择 `finish-rollover`，或选择 Git/PR、检查现场、重新开发及放弃。
- Buildr 维护者：维护 carrier 内容证明、资格判断、幂等 cleanup 与 SQLite current-row fence。
- 使用 Task Finish 的人：不再被“新 Candidate 未远端交付 + 旧无副作用 run”永久阻塞，同时不牺牲现场安全。

## 核心流程

1. Product 首次返回 prepare blocked/failed carrier 时保存不可刷新的 disposability proof。
2. 新 Handoff 出现后，Finish facts重验旧 run、carrier、side effects 与 topology。
3. `task next` 只读暴露 `stale-run-retirable` 和 `finish-rollover` capability。
4. Agent 显式提交 recovery token；Product 先精确清理旧 carrier，再以 current digest fence 原子替换为新 active run。
5. 新 run 沿既有正常 Finish/resume 路径继续，最终 Delivery仍由真实远端对账。

## 关键变化

- 增加 carrier HEAD/index/worktree/untracked 内容证明。
- 区分 remote reconciliation retirement 与 local stale-run rollover 资格。
- 增加显式 `task finish rollover`，普通 `run` 保持 identity conflict。
- Task Entry Snapshot 在第一次失败前展示阻碍、资格和能力。

## 影响、风险与兼容性

主要风险是误删 carrier 中的 Agent 工作以及 cleanup 与 SQLite 转换之间的崩溃窗口。实现通过完整内容identity、历史缺失关闭式阻断、先cleanup后CAS、幂等缺失处理和逐selector effects控制风险。现有正常run、同run resume、direct Git/PR reconciliation与远端containment契约保持不变。

## 验收摘要

- 未修改且无副作用的旧 prepare-failed carrier可以由Agent显式安全换代。
- 任一内容、owner、topology、lease、副作用或current row漂移都保留现场并阻断。
- 多repository部分cleanup与进程中断可以按同一identity幂等重试。
- `task next` 提前暴露 `finish-rollover`，但不访问远端或选择唯一策略。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/task-finish-execution/spec.md)
- [Implementation tasks](tasks.md)
