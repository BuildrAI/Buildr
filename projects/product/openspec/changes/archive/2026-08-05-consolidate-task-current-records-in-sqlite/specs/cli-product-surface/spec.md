## MODIFIED Requirements

### Requirement: CLI 必须提供最小 Task Verification Result 管理入口
Buildr CLI MUST 只通过 `task verification inspect|record` 管理一个 Task current Result。`inspect` MUST 接受 Task ID 与可选 current target identity；`record` MUST 接受完整 target、实际 capability facts、coverage gaps 和 `passed|not-passed` conclusion。两者 MAY 接受 matching ready Task Environment 根作为 `--declaration-root`，但 MUST 通过 Task Verification Application 完成 ownership、领域校验与持久化。

#### Scenario: inspect current Result
- **WHEN** Agent 调用 `buildr task verification inspect <task-id> [--target-identity <identity>] --json`
- **THEN** stdout MUST 返回一个稳定 operation envelope、current Result、digest 与派生 applicability
- **AND** 命令 MUST 不准备 Environment、不执行 capability、不改变任何记录

#### Scenario: inspect Task Environment declaration
- **WHEN** Agent 为尚未集成的 target 追加 `--declaration-root <task-environment-root>`
- **THEN** Application MUST 证明该 root 属于当前 Task 的 ready Environment 后再观察 declaration
- **AND** 任意其他本机目录 MUST 被拒绝且原 current 不变

#### Scenario: record 完整 Result
- **WHEN** Agent 为 active Task 提供完整合法 facts 与 conclusion
- **THEN** CLI MUST 调用 Application 原子整值替换 current
- **AND** 返回effects MUST只披露created/updated的Workspace SQLite logical locator

#### Scenario: record 不完整
- **WHEN** target、capability fact、coverage gap 或 conclusion 不能构成完整 closed-schema Result
- **THEN** CLI MUST 返回 blocked operation result 与具体 field diagnostic
- **AND** 原 current MUST 保持不变
