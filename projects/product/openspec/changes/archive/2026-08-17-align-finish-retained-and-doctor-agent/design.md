## Context

`task finish run` 的入口已经一次聚合 Environment / Development / 交付缺口，且 `--agent` 与 Environment adapter 不一致会得到 `environment` 缺口。省略 `--agent` 时产品已回落到 Environment adapter。真正把错误宿主 Doctor 跑起来的，是 Agent 把当前聊天宿主写进 `--agent`。

retained 与目标远端不对齐时，产品要到 `deliver` 才报 `task-finish.retained-workspace-not-ready`。此时 run 往往已经走过 prepare/verify，空转成本高。Task Finish Skill 已要求调用前轻量确认对齐，但该确认不是产品门禁，跳过后仍会创建 run。

## Goals / Non-Goals

**Goals:**

- `preflight` 观察 retained 当前符号分支与目标远端是否可快进对齐；未对齐时 fail closed，零 carrier/push/activation。
- `deliver` 现有 retained 收敛检查保留为第二道防线。
- Finish Doctor 的 agent 只来自 Environment 已绑定 adapter；省略 `--agent` 使用该值，传入值必须一致。
- Skill 禁止用会话宿主覆盖 Environment adapter。

**Non-Goals:**

- 不在 Finish 内自动 `fetch` / `merge --ff-only` / rebase。
- 不把对齐失败做成新的 `task_finish.entry_gaps` 缺口码。
- 不改变 prepare `--agent` 必填语义。
- 不处理 GitHub 短超时探测或共享 Skill 回执修复。

## Decisions

1. **对齐检查放在 `preflight`，不放入口聚合。**  
   现有 Skill 明确禁止把“主工作区落后”做成新的 `entry_gaps`。入口继续只观察 Environment / Development / remote 可解析性；对齐是 Git 观察，归入五阶段的廉价 preflight。未对齐时不创建 carrier、不 push。  
   备选：入口 `delivery` 缺口——会被 Skill 禁令挡住。备选：只改 Skill——无法挡住跳过确认的调用。

2. **不对齐即停止，不代为对齐。**  
   Finish 不获得 Git Operations 的 fetch/rebase 授权。Agent 或用户在调用前对齐 retained。`deliver` 仍要求 retained HEAD 等于已观察远端 target ref。  
   备选：preflight 自动快进——扩大 Finish Git 权限，且与“轻量确认后由人处理”冲突。

3. **Doctor agent 以 Environment adapter 为唯一来源。**  
   入口已实现 `requestedAgent || environmentAdapter` 与 mismatch 缺口。本 Change 把它写成契约，并让 Skill 省略 `--agent` 或显式传入 Environment adapter。  
   备选：Finish `--agent` 改为必填——与 prepare 对称，但会迫使 Agent 再猜一次宿主。省略并回落 Environment 更不容易写错。

## Risks / Trade-offs

- [远端暂不可达] → preflight 与现有 `target-fetch` 一样 fail closed；不把超时伪装成已对齐。短超时探测属于另一 Task。
- [Skill 仍被跳过] → 产品 preflight 仍挡住未对齐的 run，只是会留下无副作用的 blocked run。
- [已对齐的 dirty tree] → 仍由 `deliver` 的 clean/exact-ref 检查负责，本 Change 不放宽。
