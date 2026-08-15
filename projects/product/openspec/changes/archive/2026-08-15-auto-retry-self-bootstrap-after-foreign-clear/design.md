## Context

Buildr 自举收尾 runner 会在发现 foreign Finish carrier 时，于任何 Git、sync、安装、Doctor 或 Finish resume 副作用前返回 recovery plan。foreign owner 完成 cleanup 后，当前 run 已没有跨 owner 动作，但现行 Skill 仍把重新调用当前 runner 视为新的授权点。同时，等待期间远端 `dev` 可能前进；现有 runner 只接受本地已经位于该后继链上的状态，本地落后时会直接报告 remote drift。

这个变化只调整 Buildr 自举 Workspace 的 Agent 编排与 runner preflight。Formal Finish、Task Record、SQLite、普通 Workspace 与 npm package 均不改变。

## Goals / Non-Goals

**Goals:**

- 保留 foreign carrier 存在期间的零副作用 fail-closed 和跨 owner 显式授权。
- 同一次已获授权的 self-bootstrap closeout 仅因 foreign carrier 阻断且零副作用时，在 foreign owner 清理完成后允许 Agent 自动重试一次。
- 重试先把 clean retained `dev` 以 fast-forward 更新到最新远端 `dev`，再从头核验 frozen ref、Buildr provenance、run/plan identity 与全部既有 preflight。
- 任何无法安全 fast-forward 或无法证明最新 `dev` 身份的情况均停止并报告，等待新指令。

**Non-Goals:**

- 不自动执行 foreign owner cleanup，不授予跨 owner mutation authority。
- 不执行 merge commit、rebase、冲突解决、stash、reset 或 force push。
- 不增加后台等待、持久队列、自动递归、SQLite/Application 状态或第二个 orchestrator。
- 不改变 Formal Finish Result 或 Task lifecycle authority。

## Decisions

### Decision: current retry 复用原 closeout 授权

Recovery plan 继续把 foreign cleanup 标记为 `authorization.required: true`；最后的 `retry-current-closeout` 改为 `authorization.required: false`，并明确其授权来源是当前已授权 closeout。只有前次 diagnostic 精确为 foreign-carrier block、结果 effects 为空、foreign 集合已清空、run/target/node 与 runner command 均未改变时，Agent 才自动重新调用同一 runner。

Agent 最多自动重试一次。重试再次 blocked、出现新的 foreign carrier 或 identity 改变时停止报告，避免隐式循环。

### Decision: latest dev 只采用 clean fast-forward

runner 在既有 clean-tree、branch 和 remote identity 核验后读取最新远端 target ref。若远端领先本地且本地是其 ancestor，runner 执行显式 fetch refspec 与 `merge --ff-only FETCH_HEAD`，记录 fast-forward effect，再按更新后的 HEAD 执行既有 Buildr-owned descendant 检查。

若本地与远端分叉、远端不是 frozen ref 的可证明 Buildr-owned descendant、链中含 merge/未知 provenance，或 fetch/readback 后 identity 漂移，runner 在 sync、安装与 finalize 前 blocked。这里的“自动合并”仅指 Git fast-forward，不做三方 merge 或 rebase。

### Decision: 不引入等待器

runner 仍是一次性确定性命令。foreign owner 清理期间由 Agent 保持当前会话上下文并只读观察；阻断解除后才执行一次重试。recovery plan 仍是 ephemeral read model，不保存自动重试状态。

## Risks / Trade-offs

- [远端在 fetch 后再次前进] → runner 后续 push 前已有 remote readback gate；不一致时 fail closed。
- [Agent 错把其他失败当作可重试] → Skill 限定精确 diagnostic、空 effects、同一 run/command 和一次重试上限。
- [fast-forward 引入不可信提交] → 更新后仍执行完整 descendant provenance 与 merge 检查，检查失败不进入副作用阶段。
- [恢复计划 schema 消费者依赖 required=true] → schema 不变，仅 current retry 的布尔值改变；测试同时固定 owner cleanup 仍为 true。
