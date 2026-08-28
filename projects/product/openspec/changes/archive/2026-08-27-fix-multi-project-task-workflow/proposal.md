## Why

rc.26 已让正式验证按每个有效 Project 形成独立 Verification Plan，但 Environment 准备、Result reconciliation、Current Knowledge、Finish fallback 与 Task 创建基线仍残留单 Project 或统一分支假设。真实多 Project Task 会因此在已经具备完整执行证据时无法形成 Result，或在多个准备闭包之间循环，并可能产生不完整的完成表达。

## What Changes

- 将多 Project Verification Result reconciliation 改为“Project 内严格匹配、Project 间独立聚合”，并要求 records/coverage gaps 精确覆盖全部有效 Project。
- 将全部 Project Formal Plans 的 capability preparation requirements 形成一次精确并集，避免依次 prepare 相互覆盖。
- 让 Current Knowledge disposition 按有效 Project 保存并校验完整集合，防止单 Project 结论代表整个 Task。
- 让 delivery reconciliation 在 ready shared Environment 缺少 provider repository set 时，从冻结 handoff scope 重建只读 delivery context。
- 将新 Task Git 基线从统一 `dev/origin/dev` 改为逐 repository 的声明或已核验 integration branch/remote。
- 明确 Candidate 与 Formal Verification 的硬不变量是 policy required facts；Plan identity 保持执行证据边界，不新增合并 Plan 或长期 Plan store。
- 增加多 Project 完整流程与关键失败分支测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-verification`: 支持按 Project 聚合不同 Plan 的 terminal Execution Records，并闭合 Project/能力覆盖。
- `task-environment-preparation-plans`: 支持多 Project Formal Plans 的一次性完整 capability preparation closure。
- `task-development`: Current Knowledge 按有效 Project 完整聚合，并明确 Candidate/policy/Plan 的责任边界。
- `task-finish-execution`: shared Environment 缺少 provider repository set 时允许 reconciliation 从 handoff scope 恢复只读仓库上下文。
- `agent-task-workflows`: 正式 Task 创建前按每个 repository 的权威 integration branch/remote 收敛基线。

## Impact

- 修改 Task Verification、Task Environment、Task Development、Task Finish Application 与相关 Domain。
- 更新 `buildr.task-verification/v3`、Current Knowledge/Task Development 相关契约和随包 Skills。
- 调整现有“不同 Plan 一律拒绝”的测试，新增三 Project Integration/System 黄金流程。
- 不新增合并 Plan CLI、SQLite 表、第二 Result authority 或跨机器 Plan store。
