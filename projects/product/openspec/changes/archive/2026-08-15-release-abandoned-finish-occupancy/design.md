## Context

放弃任务后，Environment 可以清 worktree，Finish 的隔离载体仍由 Finish run 占用。自举 closeout 只对 `cleanup_pending` 给出 owner 命令；`deliver` 阻塞、从未 push 的残留被标成 `manual-owner-review`，目录又不会自己消失。产品禁止把 abandoned Task 写成 completed，因此不能靠把旧 Finish resume 到 complete 来关门。

约束：公开 Finish CLI 只有 `run` 与 `inspect`；新增能力必须做成既有 `run` 的显式选项，类似 `--bootstrap-recovery`。协调器仍然不得删除 foreign carrier。

## Goals / Non-Goals

**Goals:**

- 任务已放弃、收尾单从未成功交付时，用产品入口释放隔离载体。
- closeout 对这种可证明占用给出原 owner 命令。
- Agent 放弃后走该入口，不手删目录。

**Non-Goals:**

- 不释放已经 push / `already-contained` 成功的交付。
- 不把 abandoned 改成 completed。
- 不让 closeout 或 Environment 冒充 Finish owner 删载体。
- 不把 `task abandon` 做成隐藏的 Finish writer。

## Decisions

1. **入口是 `task finish run --run <id> --release-occupancy`，不是新 action。** 与现有「只有 run/inspect」和 bootstrap-recovery 的例外方式一致。必须带 `--task` 且与 run 绑定的 Task 一致。
2. **授权来自 Task 已是 abandoned，外加「从未成功交付」。** 成功交付的证据是 `delivery.status=delivered` 或非空 `remoteAfterRef`/`finalRemoteRef`。未交付才能删载体。不接受调用方手写 token 冒充授权。
3. **释放后 run 保持 blocked/failed 类终态，不走 `completeTaskRecordFromFinish`。** 只删除可证明的 run-owned carrier，并留下 inspect 可核对的 occupancy-released 事实。Task Record 保持 abandoned。
4. **closeout 把该类 foreign 标成确定性 owner 步骤**（例如 `resume-owner-release-occupancy`），命令即上述 `--release-occupancy`。仍禁止协调器删除。identity 不可证明时继续 `unprovable`。
5. **Skill 在 abandon + environment cleanup 之后检查占用。** 若 `task finish inspect` 仍显示该 Task 的 carrier 目录，必须调用产品入口。不得 `git worktree remove` 或 `rm`。

## Risks / Trade-offs

- [误释「未交付」] → 只认产品 Result 上的 delivery/remote refs，不认 Git 外观或目录时间。
- [放弃后仍有人想交付旧载体] → 任务已终态不可重开；要交付必须新任务。这是刻意取舍。
- [Agent 仍可能手删] → Skill 与 closeout 契约测试锁住；产品入口才是权威。

## Migration Plan

部署后对新的放弃+占用立即生效。仓库里已手删的目录不必回放。仍占着的旧 run 用同一 `--release-occupancy` 释放。

## Open Questions

（无。已交付占用一律拒绝释放，不另做强制回滚。）
