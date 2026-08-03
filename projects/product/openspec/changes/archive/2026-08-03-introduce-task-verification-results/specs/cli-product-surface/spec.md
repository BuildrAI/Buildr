## MODIFIED Requirements

### Requirement: Project 验证执行必须成为公开 CLI 表面
Buildr MUST 将 `buildr verification run` 登记为 public transient execution CLI，要求显式 `--project`、一个或多个 `--capability`、`--target-identity` 与 `--target`，并支持可选 Task Environment context、capability effects/resource authorization、bounded concurrency 与 `--json`。`effects.authorization: explicit` MUST 要求精确 `--authorize-capability <id>`，声明为 explicit 的资源 MUST 要求精确 `--authorize-resource <id>`。execution summary MUST 只写 provider-owned 临时目录，不得提供 caller-managed output writer。根帮助和专题帮助 MUST 说明该命令只执行 Project v2 中已有 command capabilities，不选择语义适用性、不调度 Agent、不创建 Task、不写 current Result。

#### Scenario: 用户查看 verification run 帮助
- **WHEN** 用户运行 `buildr help verification run`
- **THEN** 帮助 MUST 展示显式 capability、target identity、可选 Task context 与 transient evidence lifecycle
- **AND** 帮助 MUST 不出现 affected/candidate level、required assurance、Buildr Product 专用默认测试或 Result writer 暗示

#### Scenario: 参数不足时请求 JSON
- **WHEN** 调用方缺少 Project、capability、target identity 或必要 Task binding 并请求 `--json`
- **THEN** 命令 MUST 返回 `buildr.verification-execution/v1` 的机器可读错误并以非零状态退出
- **AND** stdout MUST 保持单一 JSON 对象且不得混入 worker 文本

#### Scenario: 调用旧 level 参数
- **WHEN** 调用方传入 `--level`、`--include-advisory` 或 `--candidate-fingerprint`
- **THEN** CLI MUST 作为 unknown argument 拒绝
- **AND** MUST NOT 启动 capability 或写 evidence

## ADDED Requirements

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
- **AND** 返回 effects MUST 只披露 created/updated 的 portable Result path

#### Scenario: record 不完整
- **WHEN** target、capability fact、coverage gap 或 conclusion 不能构成完整 closed-schema Result
- **THEN** CLI MUST 返回 blocked operation result 与具体 field diagnostic
- **AND** 原 current MUST 保持不变
