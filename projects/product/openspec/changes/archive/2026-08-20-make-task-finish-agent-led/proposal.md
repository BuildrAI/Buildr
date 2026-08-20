## Why

当前 Task Finish 把交付执行路径、内部运行状态、远端证明、运行时激活、环境清理和 Task 终态绑成唯一固定事务。多仓库部分交付续跑已经证明：Buildr 自身的登记或清理缺陷会否定 Git 已成立的交付事实，并阻止智能体继续工作，这违背“Buildr 约束智能体不要做错事，而不是要求智能体必须通过 Buildr 才能做事”的产品原则。

## What Changes

- **BREAKING**：Task Finish 从唯一交付执行器后退为可选自动执行路径与权威结果收敛入口；智能体可以使用 Git Operations、PR 或其他已授权方式完成交付，再由 Buildr 观察最终事实。
- 新增交付收敛（delivery reconciliation）语义：按仓库核对任务贡献、目标仓库/远端/分支、最终远端提交和包含关系，事实成立即登记，不要求交付必须由 Finish run 或 Delivery Carrier 产生。
- **BREAKING**：Task 的“已交付”结论不再依赖 retained Doctor、Environment cleanup、Finish transient cleanup 或 execution record 成功；这些事实独立展示并继续由智能体处理。
- 保留窄安全边界：目标与授权明确、远端包含任务贡献、不覆盖他人工作、不在无法证明 ownership 时删除资源。门禁只阻止对应危险动作，不阻断无关仓库或任务事实。
- 修复多仓库续跑：远端仍等于 carrier 时保持 `carrier`；只有远端后继完整包含 carrier 并同时形成证明时才写 `already-contained`。
- execution record 容量或持久化失败降级为可观测性 attention，不再阻止已授权交付执行。
- Buildr 自举激活继续提供自动 runner，但从 Task 交付终态中解耦；失败保留“已交付、激活待处理”事实并交给智能体收敛。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `task-finish-execution`：增加 Agent 主导的结果收敛，收窄硬门禁并解耦交付、激活和清理。
- `task-record`：允许在远端交付事实成立后提交 Task 交付终态，并独立投影激活与清理 attention。
- `task-environments`：环境清理继续保护资源 ownership，但不再拥有或否定 Task 的代码交付结论。
- `task-execution-artifacts`：Finish diagnostics record 失败降级，不再成为交付启动门禁。
- `task-closeout-orchestration`：自举 runner 从 Formal Finish 完成条件中解耦，作为 Agent 持有交付事实后的专项激活能力。

## Impact

- 影响 Task Finish CLI/Application、run persistence、per-repository delivery reconciliation、Task terminal projection、Task Environment cleanup handoff、execution record producer 和 self-bootstrap projection/runner。
- 需要更新 `task-finish`、`buildr-self-bootstrap-sync`、`git-operations` 与 `task-development` 的协作边界和 runtime 投射。
- 需要兼容现有 blocked/cleanup_pending run，并为缺失或错误的 `already-contained` 证明提供可重建恢复。
- 需要真实多仓库、外部交付收敛、Doctor blocked、cleanup blocked 和 execution-record attention 的系统回归。
