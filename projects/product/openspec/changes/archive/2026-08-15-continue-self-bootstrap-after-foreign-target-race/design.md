## Context

`buildr-self-bootstrap-sync` 已允许 foreign carrier 清除后对同一 runner 自动重试一次，并在重试开始时把 clean retained `dev` fast-forward 到最新远端。Task Finish 本身也已有 `target-race` 恢复：使用 matching token 重置 carrier phases，并在最新 Delivery Baseline 上重新 prepare。

两者当前没有组合语义。runner 在 finalize 中第一次恢复 Finish 后，只接受 `complete`，因此精确的 `task-finish.target-race` 也被折叠为通用 incomplete。实际恢复需要 Agent 流程外再次调用同一 Finish run。

## Goals / Non-Goals

**Goals:**

- 让 foreign-clear 唯一重试可以有界承接一次既有 target-race 恢复。
- 无冲突时自动完成；有路径重叠时保留 carrier，由 Agent 审核适配并继续。
- Agent 无法证明安全适配时，把语义或授权决定交给用户。
- 保持单 run、matching token、无持久 runner state 和无自动循环。

**Non-Goals:**

- 不改变通用 Task Finish target-race Domain、token 或 carrier reset 机制。
- 不为普通 runner invocation、其他 blocked code 或重复 target-race 增加重试。
- 不自动解决 Git/语义冲突，不新增队列、后台协调器或第二份恢复记录。

## Decisions

### 仅识别精确 target-race Result

第一次 same-run resume 返回后，runner 只在 `--retry-after-foreign-clear true` 模式下检查完整条件：`status=blocked`、`primaryFailure.phase=deliver`、`primaryFailure.code=task-finish.target-race`、`resume.phase=deliver` 且存在 token。满足时才调用一次现有 Finish resume；其他结果保持当前 fail-closed 语义。

相比把所有 incomplete Result 都重试，这能把新行为限制在已获授权且可证明的组合场景。

### 复用 Task Finish，不在 runner 重建 carrier 状态机

runner 把 target-race Result 的 exact token 交回同一 Product CLI。carrier phase reset、最新 baseline prepare、冲突检测和新 token 仍由 Task Finish 独占。

相比在 runner 内复制 reset、Git apply 或 containment 算法，这避免出现第二套交付 authority。

### 一次承接后按结果分流

- 第二次 resume 为 `complete`：runner finalize passed。
- 第二次 resume 为精确 Delivery Adaptation required：runner 返回专用 blocked diagnostic，携带 run、carrier、failure 与 matching resume evidence；Agent 在 carrier 内审核/适配，并按同一 Task Finish owner 继续。Agent 无法证明安全处理时请求用户授权。
- 第二次 resume 为其他 blocked/failed、再次 target-race 或 identity 不完整：停止报告，不再自动调用。

该分流让 Agent 成为适配执行主体，同时保留用户处理不可证明语义的授权边界。

### 不新增持久状态

是否允许承接仅由当前 invocation 的 `--retry-after-foreign-clear true` 与第一次 resume Result 决定；调用次数由本次进程局部控制。重跑仍从 Product Finish Result、Git/ref 和 carrier 事实重新证明，避免新增 retry counter 或 recovery store。

## Risks / Trade-offs

- [第二次 resume 可能进入 Delivery Adaptation] → runner 不自动修改 carrier，返回可操作的专用 diagnostic；Agent 处理不了才请求用户。
- [并发目标再次前进] → 本次只承接一次；再次 target-race 立即停止，避免活锁。
- [直接 Task Finish 继续可能绕开 runner] → 仅对 runner 已完成 sync、安装和 development entry gate 后返回的 adaptation-required carrier开放窄交接；其他自举 Finish 仍由 runner 编排。
- [结果 evidence 不足导致误判] → 同时校验 phase、code、resume phase/token；任何缺失都保持原 blocked。
