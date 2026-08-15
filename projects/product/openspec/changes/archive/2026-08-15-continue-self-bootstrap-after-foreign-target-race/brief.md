# foreign-clear 后的自举 target-race 有界恢复

## 一句话摘要

让 Buildr 自举 runner 在 foreign carrier 清除后的唯一重试中，遇到同一 Finish run 的 target-race 时复用既有恢复机制继续一次，并把语义适配留给 Agent。

## 背景与问题

foreign-clear 重试会先快进 retained `dev`，并行交付可能使原 Finish run 随后命中 target-race。当前 runner 只接受 resume 后 `complete`，把可恢复 Result 折叠为 generic incomplete，导致需要流程外人工例外。

## 目标与非目标

- 目标：一次有界 target-race 承接；无冲突自动完成；有冲突由 Agent 适配，无法证明时请求用户授权。
- 非目标：不改变通用 Task Finish 状态机，不重试任意 blocked，不新增队列、持久 counter 或自动冲突解决。

## 受影响用户或角色

主要影响在 Buildr 自举 Workspace 中执行 Formal Finish 与 post-Finish activation 的 Agent；普通 Buildr 用户 Workspace 不受影响。

## 核心流程

foreign owner cleanup → runner 唯一 retry → latest `dev` fast-forward → same-run resume → 精确 target-race 时再 resume 一次 → complete 或 Agent 适配交接。

## 关键变化

- runner 仅在 `--retry-after-foreign-clear true` 下识别完整 target-race evidence。
- second resume 继续使用 Product Task Finish；runner 不复制 carrier reset。
- Delivery Adaptation required 返回专用诊断；Agent 处理不了才请求用户。
- 再次 race 或其他不确定 Result 立即停止，无循环。

## 影响、风险与兼容性

变更保持 additive 且只影响自举 Skill runner。主要风险是并发再次推进 target；通过单次调用上限和 fail-closed 处理。无数据迁移、外部依赖或破坏性兼容变化。

## 验收摘要

integration tests 已证明机械完成、Agent 适配交接、普通调用不重试、再次 target-race 停止；OpenSpec strict/preflight、Component integrity 与 pre-convergence affected product verification 均已通过。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-closeout-orchestration/spec.md`
- `tasks.md`
